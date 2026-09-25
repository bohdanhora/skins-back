import { Injectable } from '@nestjs/common';
import { decodeHex } from '@csfloat/cs2-inspect-serializer';

import { fetchText } from '../../common/http/fetch-json';
import { phaseFromPaintIndex, type MarketPhase } from '../../domain/market-variant';

const LISTING_URL = 'https://steamcommunity.com/market/listings/730';
const REQUEST_TIMEOUT_MS = 30_000;

interface RawProperty {
  propertyid: number;
  int_value?: string;
  float_value?: number;
  string_value?: string;
}

interface RawSteamListing {
  listingid: string;
  strSubtotal: string;
  description: { market_hash_name: string };
  asset: { asset_properties?: RawProperty[] };
}

interface RawSteamPage {
  pages: { listings: RawSteamListing[] }[];
}

export interface SteamListing {
  id: string;
  priceLabel: string;
  float: number | null;
  paintSeed: number | null;
  phase: MarketPhase | null;
  url: string;
}

@Injectable()
export class SteamMarketClient {
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
    const pages = await Promise.all(
      [0, 20, 40].map(async (start) =>
        parseSteamPage(await fetchText(`${url}?start=${start}`, options)),
      ),
    );

    return pages
      .flatMap((page) => page.pages)
      .flatMap((entry) => entry.listings)
      .filter((listing) => listing.description.market_hash_name === name)
      .map((listing) => toSteamListing(listing, url))
      .filter(
        (listing) =>
          (floatFrom === undefined || (listing.float !== null && listing.float >= floatFrom)) &&
          (floatTo === undefined || (listing.float !== null && listing.float <= floatTo)) &&
          (!phase || listing.phase === phase),
      );
  }
}

const toSteamListing = (listing: RawSteamListing, url: string): SteamListing => {
  const properties = listing.asset.asset_properties ?? [];
  const float = properties.find((property) => property.propertyid === 2)?.float_value ?? null;
  const paintSeedValue = properties.find((property) => property.propertyid === 1)?.int_value;
  const inspect = properties.find((property) => property.propertyid === 6)?.string_value;
  let phase: MarketPhase | null = null;

  if (inspect) {
    try {
      phase = phaseFromPaintIndex(decodeHex(inspect).paintindex ?? 0);
    } catch {
      phase = null;
    }
  }

  return {
    id: listing.listingid,
    priceLabel: listing.strSubtotal.replace('UAH', '₴').replace(/\s+/g, ' ').trim(),
    float,
    paintSeed: paintSeedValue ? Number(paintSeedValue) : null,
    phase,
    url,
  };
};

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
