import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dollarsToCents } from '../../domain/listing';
import {
  isCommonDopplerPhase,
  normalizeMarketPhase,
  variantName,
  type MarketPhase,
} from '../../domain/market-variant';

const EXPORT_URL = 'https://export.white.market/v1/prices/730.json';
const EXPORT_TIMEOUT_MS = 120_000;

export interface RawExportRow {
  market_hash_name: string;
  price: string;
  market_product_link: string;
  market_product_count: number;
  cheapest_float: string | null;
}

export interface WhiteMarketPrice {
  price: number;
  listings: number;
  url: string;
  cheapestFloat: number | null;
  phase: MarketPhase | null;
}

const phaseFromUrl = (url: string): MarketPhase | null => {
  try {
    return normalizeMarketPhase(new URL(url).searchParams.get('csgoPhase'));
  } catch {
    return null;
  }
};

@Injectable()
export class WhiteMarketExportClient {
  async fetchPrices(): Promise<Map<string, WhiteMarketPrice>> {
    const rows = await fetchJson<RawExportRow[]>(EXPORT_URL, { timeoutMs: EXPORT_TIMEOUT_MS });

    return mapWhiteMarketPrices(rows);
  }
}

export const mapWhiteMarketPrices = (rows: RawExportRow[]): Map<string, WhiteMarketPrice> => {
  const prices = new Map<string, WhiteMarketPrice>();

  for (const row of rows) {
    const price = dollarsToCents(row.price);

    if (!row.market_hash_name || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    const phase = phaseFromUrl(row.market_product_link);
    const value: WhiteMarketPrice = {
      price,
      listings: row.market_product_count,
      url: row.market_product_link,
      cheapestFloat: row.cheapest_float ? Number(row.cheapest_float) : null,
      phase,
    };

    prices.set(variantName(row.market_hash_name, phase), value);

    if (phase && isCommonDopplerPhase(phase)) {
      const current = prices.get(row.market_hash_name);

      if (!current || value.price < current.price) {
        prices.set(row.market_hash_name, { ...value, phase: null });
      }
    }
  }

  return prices;
};
