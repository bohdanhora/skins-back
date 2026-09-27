import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { UpstreamError, wait } from '../../common/http/fetch-json';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';
import {
  findSnipes,
  liveOrders,
  type DepthOrder,
  type FloatSnipe,
  type SnipeCandidate,
} from '../../domain/float-snipes';
import { cheapestPrice } from '../../domain/comparison';
import { DMARKET_FLOAT_PARTS } from '../../domain/float';
import { summarizeDepth } from '../../domain/phase-prices';
import { parseVariantName } from '../../domain/market-variant';
import { DmarketDepthClient } from '../dmarket/dmarket-depth.client';
import { CsfloatClient } from '../csfloat/csfloat.client';
import { PriceBoardService, type PricedItem } from '../prices/price-board.service';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';

const CACHE_KEY = 'float-snipes';
const BID_RECHECK_MS = 30 * 60_000;
const HAS_WEAR = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;
const MIN_PRICE_CENTS = 50;
const WHITE_MARKET_LISTINGS = 50;
const HOT_REFRESH_MS = 10 * 60_000;
const IDLE_PAUSE_MS = 60_000;
const WARMUP_PAUSE_MS = 5_000;
const ERROR_PAUSE_MS = 5_000;
const SAVE_EVERY = 100;
const CSFLOAT_SCAN_INTERVAL_MS = 3 * 60_000;
const CSFLOAT_BACKOFF_MS = 5 * 60_000;
const CSFLOAT_ORDERS_INTERVAL_MS = 60_000;
const CSFLOAT_ORDERS_TTL_MS = 30 * 60_000;

export interface ItemSnipes {
  snipes: FloatSnipe[];
  checkedAt: number;
}

export interface SnipeScanProgress {
  checked: number;
  total: number;
}

const cheapest = (item: PricedItem): number | null => cheapestPrice(item);

const restoreSnipe = (snipe: FloatSnipe): FloatSnipe => {
  const range = snipe.orderFloatPart ? DMARKET_FLOAT_PARTS[snipe.orderFloatPart] : undefined;

  return {
    ...snipe,
    orderMarket: snipe.orderMarket ?? 'dmarket',
    orderFloatRanges: snipe.orderFloatRanges ?? (range ? [range] : []),
  };
};

@Injectable()
export class FloatSnipeScannerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FloatSnipeScannerService.name);
  private readonly cache: DiskCache;
  private results = new Map<string, ItemSnipes>();
  private candidateCache: { version: number; names: string[] } = { version: -1, names: [] };
  private stopped = false;
  private sinceSave = 0;
  private nextCsfloatScanAt = 0;
  private nextCsfloatOrdersAt = 0;
  private readonly csfloatOrderCache = new Map<string, { orders: DepthOrder[]; at: number }>();

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
    private readonly board: PriceBoardService,
    private readonly depth: DmarketDepthClient,
    private readonly whiteMarketPartner: WhiteMarketPartnerClient,
    private readonly csfloat: CsfloatClient,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  all(): ReadonlyMap<string, ItemSnipes> {
    return this.results;
  }

  progress(): SnipeScanProgress {
    const names = this.candidates();
    const fresh = Date.now() - this.sync.floatRefreshMs;

    return {
      checked: names.filter((name) => (this.results.get(name)?.checkedAt ?? 0) > fresh).length,
      total: names.length,
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    const cached = await this.cache.read<Record<string, ItemSnipes>>(CACHE_KEY);

    if (cached) {
      this.results = new Map(
        Object.entries(cached.value).map(([name, result]) => [
          name,
          { ...result, snipes: result.snipes.map(restoreSnipe) },
        ]),
      );
      this.logger.log(`Float finds restored from disk: ${this.results.size} items`);
    }

    void this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.persist();
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      const next = this.nextBidCheck() ?? this.nextStale();

      if (!next) {
        await wait(this.candidates().length === 0 ? WARMUP_PAUSE_MS : IDLE_PAUSE_MS);
        continue;
      }

      try {
        this.results.set(next, { snipes: await this.scan(next), checkedAt: Date.now() });
      } catch (error) {
        const previous = this.results.get(next);

        this.results.set(next, { snipes: previous?.snipes ?? [], checkedAt: Date.now() });
        this.logger.warn(`Float scan for "${next}" failed: ${String(error)}`);
        await wait(ERROR_PAUSE_MS);
      }

      this.sinceSave += 1;

      if (this.sinceSave >= SAVE_EVERY) {
        await this.persist();
      }
    }
  }

  private async scan(name: string): Promise<FloatSnipe[]> {
    const depth = await this.depth.fetch(name, 'background');
    const { offers } = depth;
    const orders = liveOrders(offers, depth.orders);

    this.board.recordDepth(name, summarizeDepth(offers, depth.orders));

    const candidates: SnipeCandidate[] = offers.map((offer) => ({ ...offer, source: 'dmarket' }));
    const known = [...orders, ...this.cachedCsfloatOrders(name)];

    candidates.push(...(await this.whiteMarketCandidates(name, known)));
    candidates.push(...(await this.csfloatCandidates(name, known)));

    return findSnipes(candidates, [...orders, ...(await this.csfloatOrders(name, candidates))]);
  }

  private cachedCsfloatOrders(name: string): DepthOrder[] {
    const cached = this.csfloatOrderCache.get(name);

    return cached && Date.now() - cached.at < CSFLOAT_ORDERS_TTL_MS ? cached.orders : [];
  }

  private async csfloatOrders(name: string, candidates: SnipeCandidate[]): Promise<DepthOrder[]> {
    const cachedAt = this.csfloatOrderCache.get(name)?.at ?? 0;
    const floats = candidates.flatMap((candidate) => candidate.float ?? []);

    if (
      !this.csfloat.isEnabled ||
      Date.now() - cachedAt < CSFLOAT_ORDERS_TTL_MS ||
      Date.now() < this.nextCsfloatOrdersAt ||
      floats.length === 0
    ) {
      return this.cachedCsfloatOrders(name);
    }

    this.nextCsfloatOrdersAt = Date.now() + CSFLOAT_ORDERS_INTERVAL_MS;

    try {
      const orders = await this.csfloat.fetchBuyOrders(name, Math.min(...floats), {
        background: true,
      });

      this.csfloatOrderCache.set(name, { orders, at: Date.now() });

      return orders;
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 429) {
        this.nextCsfloatOrdersAt = Date.now() + CSFLOAT_BACKOFF_MS;
      }
      this.logger.warn(`CSFloat buy orders for "${name}" failed: ${String(error)}`);
      return [];
    }
  }

  private async csfloatCandidates(name: string, orders: DepthOrder[]): Promise<SnipeCandidate[]> {
    if (!this.csfloat.isEnabled || Date.now() < this.nextCsfloatScanAt) return [];

    const bestOrder = Math.max(0, ...orders.map((order) => order.price));

    if (bestOrder <= (this.board.find(name)?.csfloat?.price ?? Infinity)) return [];

    this.nextCsfloatScanAt = Date.now() + CSFLOAT_SCAN_INTERVAL_MS;

    try {
      const listings = await this.csfloat.searchListings({ name }, { background: true });

      return listings
        .filter((listing) => listing.price < bestOrder)
        .map((listing) => ({
          source: 'csfloat',
          price: listing.price,
          float: listing.float,
          paintSeed: listing.paintSeed,
          phase: listing.phase,
          listingUrl: listing.url,
        }));
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 429) {
        this.nextCsfloatScanAt = Date.now() + CSFLOAT_BACKOFF_MS;
      }
      this.logger.warn(`CSFloat listings for "${name}" failed: ${String(error)}`);
      return [];
    }
  }

  private async whiteMarketCandidates(
    name: string,
    orders: DepthOrder[],
  ): Promise<SnipeCandidate[]> {
    const cheapest = this.board.whiteMarketPrice(name);
    const floatOrders = orders.filter((order) => order.paintSeed === null && order.phase === null);
    const bestOrder = Math.max(0, ...floatOrders.map((order) => order.price));

    if (!cheapest || bestOrder <= cheapest.price) {
      return [];
    }

    if (this.whiteMarketPartner.isEnabled) {
      try {
        const listings = await this.whiteMarketPartner.searchListings({
          name,
          priceTo: bestOrder,
          limit: WHITE_MARKET_LISTINGS,
        });

        return listings
          .filter((listing) => listing.float !== null)
          .map((listing) => ({
            source: 'whiteMarket',
            price: listing.price,
            float: Number(listing.float),
            paintSeed: listing.paintSeed,
            phase: null,
            listingUrl: listing.url,
          }));
      } catch (error) {
        this.logger.warn(`white.market listings for "${name}" failed: ${String(error)}`);
        return [];
      }
    }

    return cheapest.cheapestFloat === null
      ? []
      : [
          {
            source: 'whiteMarket',
            price: cheapest.price,
            float: cheapest.cheapestFloat,
            paintSeed: null,
            phase: null,
          },
        ];
  }

  private nextBidCheck(): string | undefined {
    const recheckBefore = Date.now() - BID_RECHECK_MS;

    return this.board.all().find((item) => {
      const bid = item.dmarket?.bid;
      const price = cheapestPrice(item);

      return (
        !parseVariantName(item.name).phase &&
        bid !== null &&
        bid !== undefined &&
        price !== null &&
        bid >= price &&
        this.board.depthCheckedAt(item.name) <= recheckBefore
      );
    })?.name;
  }

  private nextStale(): string | undefined {
    const now = Date.now();
    const names = this.candidates();
    const hot = names.find((name) => {
      const result = this.results.get(name);

      return !!result && result.snipes.length > 0 && now - result.checkedAt > HOT_REFRESH_MS;
    });

    return (
      hot ??
      names.find(
        (name) => now - (this.results.get(name)?.checkedAt ?? 0) > this.sync.floatRefreshMs,
      )
    );
  }

  private candidates(): string[] {
    if (this.candidateCache.version !== this.board.version) {
      this.candidateCache = {
        version: this.board.version,
        names: this.board
          .all()
          .filter((item) => {
            const price = cheapest(item);

            return (
              !parseVariantName(item.name).phase &&
              HAS_WEAR.test(item.name) &&
              (item.dmarket?.bids ?? 0) > 0 &&
              price !== null &&
              price >= MIN_PRICE_CENTS
            );
          })
          .sort((left, right) => (right.dmarket?.bids ?? 0) - (left.dmarket?.bids ?? 0))
          .map((item) => item.name),
      };
    }

    return this.candidateCache.names;
  }

  private async persist(): Promise<void> {
    this.sinceSave = 0;

    try {
      await this.cache.write(CACHE_KEY, Object.fromEntries(this.results));
    } catch (error) {
      this.logger.warn(`Could not save float finds: ${String(error)}`);
    }
  }
}
