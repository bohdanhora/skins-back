import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { wait } from '../../common/http/fetch-json';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';
import { type MarketQuote } from '../../domain/comparison';
import { summarizeSales, type DailySales, type SalesStats } from '../../domain/sales';
import { DmarketSalesClient } from '../dmarket/dmarket-sales.client';
import { PriceBoardService, type PricedItem } from './price-board.service';

const CACHE_KEY = 'sales';
/** Below this the chart is mostly noise and not worth a request. */
const MIN_PRICE_CENTS = 50;
const MIN_LISTINGS = 5;
const IDLE_PAUSE_MS = 60_000;
/** Prices are not loaded yet right after start. */
const WARMUP_PAUSE_MS = 5_000;
const ERROR_PAUSE_MS = 5_000;
const SAVE_EVERY = 250;
const CHART_TTL_MS = 30 * 60_000;
const CHART_CACHE_SIZE = 300;

interface StoredStats {
  stats: SalesStats | null;
  fetchedAt: number;
}

export interface SalesScanProgress {
  checked: number;
  total: number;
}

const listed = (quote: MarketQuote | null): number | null =>
  quote && quote.listings > 0 ? quote.price : null;

const cheapest = (item: PricedItem): number | null => {
  const prices = [listed(item.whiteMarket), listed(item.dmarket)].filter(
    (price): price is number => price !== null,
  );

  return prices.length > 0 ? Math.min(...prices) : null;
};

const supply = (item: PricedItem): number =>
  (item.whiteMarket?.listings ?? 0) + (item.dmarket?.listings ?? 0);

/**
 * Walks through liquid items one by one and keeps a short summary of their
 * recent DMarket sales. Slow on purpose: a full pass takes tens of minutes.
 */
@Injectable()
export class SalesHistoryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SalesHistoryService.name);
  private readonly cache: DiskCache;
  private stats = new Map<string, StoredStats>();
  private charts = new Map<string, { days: DailySales[]; fetchedAt: number }>();
  private candidateCache: { version: number; names: string[] } = { version: -1, names: [] };
  private stopped = false;
  private sinceSave = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
    private readonly board: PriceBoardService,
    private readonly sales: DmarketSalesClient,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  get(name: string): SalesStats | null {
    return this.stats.get(name)?.stats ?? null;
  }

  progress(): SalesScanProgress {
    const candidates = this.candidates();
    const fresh = Date.now() - this.sync.salesRefreshMs;

    return {
      checked: candidates.filter((name) => (this.stats.get(name)?.fetchedAt ?? 0) > fresh).length,
      total: candidates.length,
    };
  }

  /** Full daily chart for one item, fetched on demand and kept for a while. */
  async chart(name: string): Promise<DailySales[]> {
    const cached = this.charts.get(name);

    if (cached && Date.now() - cached.fetchedAt < CHART_TTL_MS) {
      return cached.days;
    }

    const days = await this.sales.fetchDaily(name);

    if (this.charts.size >= CHART_CACHE_SIZE) {
      this.charts.delete(this.charts.keys().next().value!);
    }

    this.charts.set(name, { days, fetchedAt: Date.now() });
    this.stats.set(name, { stats: summarizeSales(days), fetchedAt: Date.now() });

    return days;
  }

  async onApplicationBootstrap(): Promise<void> {
    const cached = await this.cache.read<Record<string, StoredStats>>(CACHE_KEY);

    if (cached) {
      this.stats = new Map(Object.entries(cached.value));
      this.logger.log(`Sales history restored from disk: ${this.stats.size} items`);
    }

    void this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.persist();
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      const next = this.nextStale();

      if (!next) {
        await wait(this.candidates().length === 0 ? WARMUP_PAUSE_MS : IDLE_PAUSE_MS);
        continue;
      }

      try {
        const days = await this.sales.fetchDaily(next, 'background');

        this.stats.set(next, { stats: summarizeSales(days), fetchedAt: Date.now() });
        this.sinceSave += 1;

        if (this.sinceSave >= SAVE_EVERY) {
          await this.persist();
        }
      } catch (error) {
        // Remember the attempt so one broken title cannot stall the whole pass.
        this.stats.set(next, { stats: this.get(next), fetchedAt: Date.now() });
        this.logger.warn(`Sales history for "${next}" failed: ${String(error)}`);
        await wait(ERROR_PAUSE_MS);
      }
    }
  }

  /** The most traded item whose summary is missing or too old. */
  private nextStale(): string | undefined {
    const staleBefore = Date.now() - this.sync.salesRefreshMs;

    return this.candidates().find((name) => (this.stats.get(name)?.fetchedAt ?? 0) <= staleBefore);
  }

  private candidates(): string[] {
    if (this.candidateCache.version !== this.board.version) {
      this.candidateCache = { version: this.board.version, names: this.pickCandidates() };
    }

    return this.candidateCache.names;
  }

  private pickCandidates(): string[] {
    return this.board
      .all()
      .filter((item) => {
        const price = cheapest(item);

        return price !== null && price >= MIN_PRICE_CENTS && supply(item) >= MIN_LISTINGS;
      })
      .sort((left, right) => supply(right) - supply(left))
      .map((item) => item.name);
  }

  private async persist(): Promise<void> {
    this.sinceSave = 0;

    try {
      await this.cache.write(CACHE_KEY, Object.fromEntries(this.stats));
    } catch (error) {
      this.logger.warn(`Could not save sales history: ${String(error)}`);
    }
  }
}
