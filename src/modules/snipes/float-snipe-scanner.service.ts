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
import {
  findSnipes,
  type DepthOrder,
  type FloatSnipe,
  type SnipeCandidate,
} from '../../domain/float-snipes';
import { DmarketDepthClient } from '../dmarket/dmarket-depth.client';
import { PriceBoardService, type PricedItem } from '../prices/price-board.service';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';

const CACHE_KEY = 'float-snipes';
const HAS_WEAR = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;
const MIN_PRICE_CENTS = 50;
/** Cheapest white.market listings compared with DMarket orders per skin. */
const WHITE_MARKET_LISTINGS = 50;
/** Finds disappear fast, so items that had one are looked at again much sooner. */
const HOT_REFRESH_MS = 10 * 60_000;
const IDLE_PAUSE_MS = 60_000;
const WARMUP_PAUSE_MS = 5_000;
const ERROR_PAUSE_MS = 5_000;
const SAVE_EVERY = 100;

export interface ItemSnipes {
  snipes: FloatSnipe[];
  checkedAt: number;
}

export interface SnipeScanProgress {
  checked: number;
  total: number;
}

const cheapest = (item: PricedItem): number | null => {
  const prices = [item.whiteMarket, item.dmarket]
    .filter((quote) => quote && quote.listings > 0 && quote.price !== null)
    .map((quote) => quote!.price!);

  return prices.length > 0 ? Math.min(...prices) : null;
};

/**
 * Reads the DMarket order book of every skin that has buy orders and looks for
 * listings whose float, pattern or phase already fits a better paying order.
 * The cheapest white.market listing is checked too: its float is public.
 */
@Injectable()
export class FloatSnipeScannerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FloatSnipeScannerService.name);
  private readonly cache: DiskCache;
  private results = new Map<string, ItemSnipes>();
  private candidateCache: { version: number; names: string[] } = { version: -1, names: [] };
  private stopped = false;
  private sinceSave = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
    private readonly board: PriceBoardService,
    private readonly depth: DmarketDepthClient,
    private readonly whiteMarketPartner: WhiteMarketPartnerClient,
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
      this.results = new Map(Object.entries(cached.value));
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
      const next = this.nextStale();

      if (!next) {
        await wait(this.candidates().length === 0 ? WARMUP_PAUSE_MS : IDLE_PAUSE_MS);
        continue;
      }

      try {
        this.results.set(next, { snipes: await this.scan(next), checkedAt: Date.now() });
      } catch (error) {
        const previous = this.results.get(next);

        // Remember the attempt so one broken title cannot stall the whole pass.
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
    const { offers, orders } = await this.depth.fetch(name, 'background');
    const candidates: SnipeCandidate[] = offers.map((offer) => ({ ...offer, source: 'dmarket' }));

    candidates.push(...(await this.whiteMarketCandidates(name, orders)));

    return findSnipes(candidates, orders);
  }

  /**
   * With the partner key: live white.market listings with their floats and own
   * pages, fetched only when some DMarket order pays more than the cheapest one.
   * Without it: the cheapest listing from the public price list, which can be stale.
   */
  private async whiteMarketCandidates(
    name: string,
    orders: DepthOrder[],
  ): Promise<SnipeCandidate[]> {
    const cheapest = this.board.whiteMarketPrice(name);
    // Pattern and phase of white.market listings are not read, so only float orders can match.
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
            paintSeed: null,
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

  /** Items that had a find come first once they get a little old, then everything else. */
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

  /** Skins with a float and at least one DMarket buy order: nothing to find elsewhere. */
  private candidates(): string[] {
    if (this.candidateCache.version !== this.board.version) {
      this.candidateCache = {
        version: this.board.version,
        names: this.board
          .all()
          .filter((item) => {
            const price = cheapest(item);

            return (
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
