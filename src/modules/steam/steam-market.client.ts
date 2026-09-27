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
const ACTIONS_URL = 'https://steamcommunity.com/market/actions';
const FLOAT_PROPERTY = 2;
const LISTINGS_PAGE = 20;
const LISTINGS_LIMIT = 60;
const BUCKET = /\{"bucket_id":"([^"]*)"[^{}]*?"filters":(\[\[[^{}]*?\]\])\}/g;
const PAGE_OPTIONS = {
  timeoutMs: REQUEST_TIMEOUT_MS,
  retries: 1,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkinScout/1.0)' },
};

interface RawSteamListing {
  listingid: string;
  strSubtotal: string;
  description: { market_hash_name: string };
  asset: { asset_properties?: RawAssetProperty[] };
}

interface RawListingsPage {
  more: boolean;
  listings: RawSteamListing[];
}

export interface SteamBucket {
  group: string;
  filters: Record<string, string[]>;
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
  private readonly buckets = new Map<string, SteamBucket>();
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
        url: listingUrl(name, this.buckets.get(name)),
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
    const [{ raw, url }, uahPerUsd] = await Promise.all([
      this.rawListings(name, floatFrom, floatTo),
      this.rates.uahPerUsd(),
    ]);

    return raw
      .filter((listing) => listing.description.market_hash_name === name)
      .map((listing) => toSteamListing(listing, url, uahPerUsd))
      .filter(
        (listing) =>
          (floatFrom === undefined || (listing.float !== null && listing.float >= floatFrom)) &&
          (floatTo === undefined || (listing.float !== null && listing.float <= floatTo)) &&
          (!phase || listing.phase === phase),
      );
  }

  private async rawListings(
    name: string,
    floatFrom?: number,
    floatTo?: number,
  ): Promise<{ raw: RawSteamListing[]; url: string }> {
    let bucket = this.buckets.get(name);

    if (!bucket) {
      const html = await fetchText(listingUrl(name), PAGE_OPTIONS);

      bucket = readBucket(html, name) ?? undefined;

      if (!bucket) {
        return {
          raw: parseSteamPage(html).pages.flatMap((page) => page.listings),
          url: listingUrl(name),
        };
      }

      this.buckets.set(name, bucket);
    }

    const listings: RawSteamListing[] = [];
    let query = bucket;

    for (let start = 0; start < LISTINGS_LIMIT; start += LISTINGS_PAGE) {
      let page = await this.queryListings(query, start, floatFrom, floatTo);

      if (start === 0 && page.listings.length === 0 && Object.keys(query.filters).length > 0) {
        query = { ...bucket, filters: {} };
        page = await this.queryListings(query, start, floatFrom, floatTo);
      }

      listings.push(...page.listings);

      if (!page.more || page.listings.length === 0) break;
    }

    return { raw: listings, url: listingUrl(name, bucket) };
  }

  private async queryListings(
    bucket: SteamBucket,
    start: number,
    floatFrom?: number,
    floatTo?: number,
  ): Promise<RawListingsPage> {
    const params = {
      appid: 730,
      strItemName: bucket.group,
      start,
      filters: bucket.filters,
      accessoryFilters: {},
      propertyFilters:
        floatFrom === undefined && floatTo === undefined
          ? {}
          : {
              [FLOAT_PROPERTY]: {
                property_id: FLOAT_PROPERTY,
                float_min: floatFrom ?? 0,
                float_max: floatTo ?? 1,
              },
            },
    };
    const query = new URLSearchParams({
      q: 'QueryListingsForItem',
      qp: JSON.stringify([params]),
    });
    const { data } = await fetchJson<{ data: RawListingsPage | null }>(`${ACTIONS_URL}?${query}`, {
      ...PAGE_OPTIONS,
      headers: { ...PAGE_OPTIONS.headers, 'x-valve-request-type': 'queryAction' },
    });

    if (!data) throw new Error('Steam did not return market listings');

    return { more: data.more, listings: data.listings ?? [] };
  }
}

export const listingUrl = (name: string, bucket?: SteamBucket): string => {
  if (!bucket) return `${LISTING_URL}/${encodeURIComponent(name)}`;

  const query = new URLSearchParams(
    Object.entries(bucket.filters).flatMap(([key, values]) =>
      values.map((value): [string, string] => [`category_${key}`, value]),
    ),
  );

  return `${LISTING_URL}/${bucket.group}?${query}`;
};

export const readBucket = (html: string, name: string): SteamBucket | null => {
  const text = html.replace(/\\+"/g, '"');
  const group = /"strItemName":"(G[0-9A-F]+)"/.exec(text)?.[1];

  if (!group) return null;

  for (const match of text.matchAll(BUCKET)) {
    try {
      if (match[1] !== name) continue;

      const filters: Record<string, string[]> = {};

      for (const [key, value] of JSON.parse(match[2]) as [string, string][]) {
        (filters[key] ??= []).push(value);
      }

      return { group, filters };
    } catch {
      continue;
    }
  }

  return null;
};

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
