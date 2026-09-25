import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dollarsToCents } from '../../domain/listing';

/** Public price list: the cheapest listing of every CS2 item, no key required. */
const EXPORT_URL = 'https://export.white.market/v1/prices/730.json';
const EXPORT_TIMEOUT_MS = 120_000;

interface RawExportRow {
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
  /** Float of the cheapest listing, when it has one. */
  cheapestFloat: number | null;
}

@Injectable()
export class WhiteMarketExportClient {
  async fetchPrices(): Promise<Map<string, WhiteMarketPrice>> {
    const rows = await fetchJson<RawExportRow[]>(EXPORT_URL, { timeoutMs: EXPORT_TIMEOUT_MS });
    const prices = new Map<string, WhiteMarketPrice>();

    for (const row of rows) {
      const price = dollarsToCents(row.price);

      if (!row.market_hash_name || !Number.isFinite(price) || price <= 0) {
        continue;
      }

      prices.set(row.market_hash_name, {
        price,
        listings: row.market_product_count,
        url: row.market_product_link,
        cheapestFloat: row.cheapest_float ? Number(row.cheapest_float) : null,
      });
    }

    return prices;
  }
}
