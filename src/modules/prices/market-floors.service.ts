import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Inject,
} from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { wait } from '../../common/http/fetch-json';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';
import { listedPrices, totalListings } from '../../domain/comparison';
import { MarketId } from '../../domain/market-links';
import { parseVariantName } from '../../domain/market-variant';
import { hasDopplerPhases } from '../../domain/phase-prices';
import {
  floorFromDays,
  floorFromSales,
  type HistoryMarketId,
  type MarketFloor,
  type MarketFloors,
} from '../../domain/sales';
import { CsfloatClient, CsfloatPausedError } from '../csfloat/csfloat.client';
import { DmarketTradingClient } from '../dmarket/dmarket-trading.client';
import { WhiteMarketStatsClient } from '../white-market/white-market-stats.client';
import { PriceBoardService } from './price-board.service';
import { SalesHistoryService } from './sales-history.service';

const CACHE_KEY = 'sales-floors';
const MIN_PRICE_CENTS = 50;
const MIN_LISTINGS = 5;
const MIN_WEEK_SALES = 1;
const IDLE_PAUSE_MS = 60_000;
const ERROR_PAUSE_MS = 10_000;
const SAVE_EVERY = 100;
const HOUR_MS = 3_600_000;

interface StoredFloor {
  floor: MarketFloor | null;
  fetchedAt: number;
}

interface FloorSource {
  market: HistoryMarketId;
  refreshMs: number;
  pauseMs: number;
  onlyCheapest: boolean;
  enabled: () => boolean;
  load: (name: string) => Promise<MarketFloor | null>;
}

export interface FloorsProgress {
  checked: number;
  total: number;
}

@Injectable()
export class MarketFloorsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MarketFloorsService.name);
  private readonly cache: DiskCache;
  private readonly floors = new Map<string, Partial<Record<HistoryMarketId, StoredFloor>>>();
  private readonly sources: FloorSource[];
  private readonly candidateCache = new Map<
    HistoryMarketId,
    { version: number; names: string[] }
  >();
  private stopped = false;
  private sinceSave = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) sync: SyncConfig,
    private readonly board: PriceBoardService,
    private readonly sales: SalesHistoryService,
    dmarket: DmarketTradingClient,
    csfloat: CsfloatClient,
    whiteMarket: WhiteMarketStatsClient,
  ) {
    this.cache = new DiskCache(app.cacheDir);
    this.sources = [
      {
        market: MarketId.Dmarket,
        refreshMs: sync.salesRefreshMs,
        pauseMs: 0,
        onlyCheapest: false,
        enabled: () => dmarket.isEnabled,
        load: async (name) => floorFromSales(await dmarket.fetchSalePrices(name)),
      },
      {
        market: MarketId.Csfloat,
        refreshMs: 24 * HOUR_MS,
        pauseMs: 0,
        onlyCheapest: true,
        enabled: () => csfloat.isEnabled,
        load: async (name) =>
          floorFromSales(await csfloat.fetchSalePrices(name, { background: true })),
      },
      {
        market: MarketId.WhiteMarket,
        refreshMs: 12 * HOUR_MS,
        pauseMs: 1_000,
        onlyCheapest: false,
        enabled: () => true,
        load: async (name) => floorFromDays(await whiteMarket.fetchDailySales(name)),
      },
    ];
  }

  get(name: string): MarketFloors {
    const stored = this.floors.get(name);

    return {
      dmarket: stored?.dmarket?.floor ?? null,
      csfloat: stored?.csfloat?.floor ?? null,
      whiteMarket: stored?.whiteMarket?.floor ?? null,
    };
  }

  progress(): Record<HistoryMarketId, FloorsProgress> {
    return Object.fromEntries(
      this.sources.map((source) => {
        const names = this.candidates(source.market);

        return [
          source.market,
          {
            checked: names.filter((name) => this.floors.get(name)?.[source.market] !== undefined)
              .length,
            total: names.length,
          },
        ];
      }),
    ) as Record<HistoryMarketId, FloorsProgress>;
  }

  async onApplicationBootstrap(): Promise<void> {
    const cached =
      await this.cache.read<Record<string, Partial<Record<HistoryMarketId, StoredFloor>>>>(
        CACHE_KEY,
      );

    for (const [name, stored] of Object.entries(cached?.value ?? {})) {
      this.floors.set(name, stored);
    }

    for (const source of this.sources) {
      void this.run(source);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.persist();
  }

  private async run(source: FloorSource): Promise<void> {
    while (!this.stopped) {
      const next = source.enabled() ? this.nextStale(source) : undefined;

      if (!next) {
        await wait(IDLE_PAUSE_MS);
        continue;
      }

      try {
        this.store(next, source.market, await source.load(next));
        await wait(source.pauseMs);
      } catch (error) {
        if (error instanceof CsfloatPausedError) {
          await wait(Math.max(ERROR_PAUSE_MS, error.until - Date.now()));
          continue;
        }

        this.store(next, source.market, this.floors.get(next)?.[source.market]?.floor ?? null);
        this.logger.warn(`${source.market} sales for "${next}" failed: ${String(error)}`);
        await wait(ERROR_PAUSE_MS);
      }
    }
  }

  private store(name: string, market: HistoryMarketId, floor: MarketFloor | null): void {
    this.floors.set(name, { ...this.floors.get(name), [market]: { floor, fetchedAt: Date.now() } });
    this.sinceSave += 1;

    if (this.sinceSave >= SAVE_EVERY) {
      void this.persist();
    }
  }

  private nextStale(source: FloorSource): string | undefined {
    const staleBefore = Date.now() - source.refreshMs;

    let next: string | undefined;
    let oldest = staleBefore;

    for (const name of this.candidates(source.market)) {
      const fetchedAt = this.floors.get(name)?.[source.market]?.fetchedAt ?? 0;

      if (fetchedAt === 0) return name;
      if (fetchedAt <= oldest) {
        next = name;
        oldest = fetchedAt;
      }
    }

    return next;
  }

  private candidates(market: HistoryMarketId): string[] {
    const cached = this.candidateCache.get(market);

    if (cached?.version === this.board.version) return cached.names;

    const source = this.sources.find((entry) => entry.market === market);
    const names = this.pickCandidates(market, source?.onlyCheapest ?? true);

    this.candidateCache.set(market, { version: this.board.version, names });

    return names;
  }

  private pickCandidates(market: HistoryMarketId, onlyCheapest: boolean): string[] {
    const rows = this.board.all().flatMap((item) => {
      const variant = parseVariantName(item.name);

      if (variant.phase === null && hasDopplerPhases(variant.marketHashName)) return [];

      const prices = listedPrices(item).sort((left, right) => left[1] - right[1]);
      const cheapest = prices[0]?.[0] === market;
      const listed = prices.find(([entry]) => entry === market);
      const sales = this.sales.get(item.name);

      return listed &&
        (cheapest || !onlyCheapest) &&
        prices[0][1] >= MIN_PRICE_CENTS &&
        totalListings(item) >= MIN_LISTINGS &&
        (sales?.weekSales ?? 0) >= MIN_WEEK_SALES
        ? [
            {
              name: item.name,
              cheapest,
              volume: sales?.eightWeekSales ?? 0,
              supply: totalListings(item),
            },
          ]
        : [];
    });

    return rows
      .sort(
        (left, right) =>
          Number(right.cheapest) - Number(left.cheapest) ||
          right.volume - left.volume ||
          right.supply - left.supply,
      )
      .map((row) => row.name);
  }

  private async persist(): Promise<void> {
    this.sinceSave = 0;

    try {
      await this.cache.write(CACHE_KEY, Object.fromEntries(this.floors));
    } catch (error) {
      this.logger.warn(`Could not save sales floors: ${String(error)}`);
    }
  }
}
