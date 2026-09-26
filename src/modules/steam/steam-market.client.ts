import { Injectable } from '@nestjs/common';

import { fetchJson, fetchText, wait } from '../../common/http/fetch-json';
import { type MarketPhase } from '../../domain/market-variant';
import { ExchangeRateClient, steamPriceToUsdCents } from './exchange-rate.client';
import { readAssetTraits, type RawAssetProperty } from './steam-asset';

const LISTING_URL = 'https://steamcommunity.com/market/listings/730';
const REQUEST_TIMEOUT_MS = 30_000;
const PRICE_OVERVIEW_URL = 'https://steamcommunity.com/market/priceoverview/';
const PRICE_TTL_MS = 15 * 60_000;
const PRICE_GAP_MS = 3_000;

interface RawSteamListing {
  listingid: string;
  strSubtotal: string;
  description: { market_hash_name: string };
  asset: { asset_properties?: RawAssetProperty[] };
}

interface RawSteamPage {
  pages: { listings: RawSteamListing[] }[];
}

interface RawPriceOverview {
  success?: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

export interface SteamPrice {
  lowest: number | null;
  median: number | null;
  volume: number;
  url: string;
}

const parseUsd = (value: string | undefined): number | null => {
  const amount = Number((value ?? '').replace(/[^\d.]/g, ''));

  return value && Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;
};

export interface SteamListing {
  id: string;
  priceLabel: string;
  price: number | null;
  float: number | null;
  paintSeed: number | null;
  phase: MarketPhase | null;
  url: string;
}

@Injectable()
export class SteamMarketClient {
  private readonly prices = new Map<string, { price: SteamPrice; at: number }>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly rates: ExchangeRateClient) {}

  priceOverview(name: string): Promise<SteamPrice> {
    const cached = this.prices.get(name);

    if (cached && Date.now() - cached.at < PRICE_TTL_MS) {
      return Promise.resolve(cached.price);
    }

    const request = this.queue.then(async () => {
      const query = new URLSearchParams({ appid: '730', currency: '1', market_hash_name: name });
      const raw = await fetchJson<RawPriceOverview>(`${PRICE_OVERVIEW_URL}?${query}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkinScout/1.0)' },
        retries: 1,
      });
      const price = {
        lowest: parseUsd(raw.lowest_price),
        median: parseUsd(raw.median_price),
        volume: Number((raw.volume ?? '0').replace(/\D/g, '')) || 0,
        url: `${LISTING_URL}/${encodeURIComponent(name)}`,
      };

      this.prices.set(name, { price, at: Date.now() });

      return price;
    });

    this.queue = request.catch(() => undefined).then(() => wait(PRICE_GAP_MS));

    return request;
  }

  async searchListings(
    name: string,
    floatFrom?: number,
    floatTo?: number,
    phase?: MarketPhase | null,
  ): Promise<SteamListing[]> {
    const url = `${LISTING_URL}/${encodeURIComponent(name)}`;
    const options = {
      timeoutMs: REQUEST_TIMEOUT_MS,
      retries: 1,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkinScout/1.0)' },
    };
    const [pages, uahPerUsd] = await Promise.all([
      Promise.all(
        [0, 20, 40].map(async (start) =>
          parseSteamPage(await fetchText(`${url}?start=${start}`, options)),
        ),
      ),
      this.rates.uahPerUsd(),
    ]);

    return pages
      .flatMap((page) => page.pages)
      .flatMap((entry) => entry.listings)
      .filter((listing) => listing.description.market_hash_name === name)
      .map((listing) => toSteamListing(listing, url, uahPerUsd))
      .filter(
        (listing) =>
          (floatFrom === undefined || (listing.float !== null && listing.float >= floatFrom)) &&
          (floatTo === undefined || (listing.float !== null && listing.float <= floatTo)) &&
          (!phase || listing.phase === phase),
      );
  }
}

const toSteamListing = (
  listing: RawSteamListing,
  url: string,
  uahPerUsd: number | null,
): SteamListing => ({
  id: listing.listingid,
  priceLabel: listing.strSubtotal.replace('UAH', '₴').replace(/\s+/g, ' ').trim(),
  price: steamPriceToUsdCents(listing.strSubtotal, uahPerUsd),
  ...readAssetTraits(listing.asset.asset_properties),
  url,
});

export const parseSteamPage = (html: string): RawSteamPage => {
  const contextMarker = 'window.SSR.renderContext=JSON.parse(';
  const contextAt = html.indexOf(contextMarker);

  if (contextAt >= 0) {
    const literal = readJsonString(html, contextAt + contextMarker.length);

    if (literal) {
      try {
        const encodedContext = JSON.parse(literal) as unknown;

        if (typeof encodedContext === 'string') {
          const context = JSON.parse(encodedContext) as { queryData?: unknown };

          if (typeof context.queryData === 'string') {
            const queryData = JSON.parse(context.queryData) as {
              queries?: { state?: { data?: unknown } }[];
            };

            for (const query of queryData.queries ?? []) {
              const data = query.state?.data;

              if (isSteamPage(data)) return data;
            }
          }
        }
      } catch (error) {
        if (!(error instanceof Error)) throw error;
      }
    }
  }

  const scripts = html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g);

  for (const match of scripts) {
    let chunk: unknown;

    try {
      chunk = JSON.parse(match[1]) as unknown;
    } catch {
      continue;
    }

    const text = Array.isArray(chunk) ? (chunk as unknown[])[1] : null;

    if (typeof text !== 'string') continue;

    const marker = '{\\"pages\\":';
    const markerAt = text.indexOf(marker);

    if (markerAt < 1 || text[markerAt - 1] !== '"') continue;

    const literal = readJsonString(text, markerAt - 1);

    if (!literal) continue;

    try {
      const decoded = JSON.parse(literal) as string;
      const page = JSON.parse(decoded) as RawSteamPage;

      if (Array.isArray(page.pages)) return page;
    } catch {
      continue;
    }
  }

  throw new Error('Steam did not return market listings');
};

const isSteamPage = (value: unknown): value is RawSteamPage => {
  if (!value || typeof value !== 'object' || !('pages' in value)) return false;

  return Array.isArray(value.pages);
};

const readJsonString = (value: string, start: number): string | null => {
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];

    if (!escaped && character === '"') return value.slice(start, index + 1);
    if (!escaped && character === '\\') {
      escaped = true;
    } else {
      escaped = false;
    }
  }

  return null;
};
