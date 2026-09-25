import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dollarsToCents } from '../../domain/listing';
import { type DailySales } from '../../domain/sales';
import { DmarketRateLimiter, type RequestPriority } from './dmarket-rate-limiter';

const SALES_GRAPH_URL = 'https://api.dmarket.com/trade-aggregator/v1/avg-sales-graph';
const CS2_GAME_ID = 'a8db';
const DAILY_PERIOD = '1M';

interface RawSalesGraph {
  totalSales?: string[];
  date?: string[];
  avgPrice?: string[];
}

@Injectable()
export class DmarketSalesClient {
  constructor(private readonly limiter: DmarketRateLimiter) {}

  async fetchDaily(
    title: string,
    priority: RequestPriority = 'interactive',
  ): Promise<DailySales[]> {
    const query = new URLSearchParams({ gameId: CS2_GAME_ID, title, period: DAILY_PERIOD });
    const raw = await this.limiter.schedule(
      () => fetchJson<RawSalesGraph>(`${SALES_GRAPH_URL}?${query.toString()}`, { retries: 1 }),
      priority,
    );
    const dates = raw.date ?? [];

    return dates.map((timestamp, index) => ({
      day: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
      average: dollarsToCents(raw.avgPrice?.[index] ?? 0),
      count: Number(raw.totalSales?.[index] ?? 0),
    }));
  }
}
