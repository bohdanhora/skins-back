import { Injectable, Logger } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { DmarketRateLimiter, type RequestPriority } from './dmarket-rate-limiter';

/** Public endpoint: best listing and best buy order per title, no key required. */
const AGGREGATED_URL = 'https://api.dmarket.com/marketplace-api/v1/aggregated-prices';
const CS2_GAME_ID = 'a8db';
const TITLES_PER_REQUEST = 200;

interface RawAmount {
  Amount: string;
}

interface RawAggregatedPrice {
  title: string;
  orderBestPrice: RawAmount | null;
  orderCount: string;
  offerBestPrice: RawAmount | null;
  offerCount: string;
}

interface RawAggregatedResponse {
  aggregatedPrices: RawAggregatedPrice[];
  nextCursor: string;
}

export interface DmarketPrice {
  price: number | null;
  listings: number;
  bid: number | null;
  bids: number;
}

const toCents = (amount: RawAmount | null): number | null => {
  const value = Number(amount?.Amount ?? 0);

  return value > 0 ? value : null;
};

@Injectable()
export class DmarketPricesClient {
  private readonly logger = new Logger(DmarketPricesClient.name);

  constructor(private readonly limiter: DmarketRateLimiter) {}

  /** Batches of 200 titles, paced to the rate limit. A failed batch is skipped, not fatal. */
  async fetchPrices(
    titles: string[],
    priority: RequestPriority = 'interactive',
  ): Promise<Map<string, DmarketPrice>> {
    const prices = new Map<string, DmarketPrice>();
    let failedBatches = 0;

    for (let start = 0; start < titles.length; start += TITLES_PER_REQUEST) {
      const batch = titles.slice(start, start + TITLES_PER_REQUEST);

      try {
        for (const row of await this.fetchBatch(batch, priority)) {
          prices.set(row.title, {
            price: toCents(row.offerBestPrice),
            listings: Number(row.offerCount),
            bid: toCents(row.orderBestPrice),
            bids: Number(row.orderCount),
          });
        }
      } catch (error) {
        failedBatches += 1;
        this.logger.warn(`DMarket batch at ${start} failed: ${String(error)}`);
      }
    }

    if (failedBatches > 0 && prices.size === 0) {
      throw new Error('DMarket did not return any prices');
    }

    return prices;
  }

  private async fetchBatch(
    titles: string[],
    priority: RequestPriority,
  ): Promise<RawAggregatedPrice[]> {
    const rows: RawAggregatedPrice[] = [];
    let cursor = '';

    do {
      const response = await this.limiter.schedule(
        () =>
          fetchJson<RawAggregatedResponse>(AGGREGATED_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filter: { game: CS2_GAME_ID, titles },
              limit: String(TITLES_PER_REQUEST),
              ...(cursor ? { cursor } : {}),
            }),
          }),
        priority,
      );

      rows.push(...response.aggregatedPrices);
      cursor = response.nextCursor;
    } while (cursor);

    return rows;
  }
}
