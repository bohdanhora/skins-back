import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';
import { type MarketQuote } from '../../domain/comparison';
import { dmarketItemUrl } from '../../domain/market-links';
import { CatalogService } from '../catalog/catalog.service';
import { DmarketPricesClient, type DmarketPrice } from '../dmarket/dmarket-prices.client';
import {
  WhiteMarketExportClient,
  type WhiteMarketPrice,
} from '../white-market/white-market-export.client';

const CACHE_KEY = 'prices';
const RETRY_AFTER_FAILURE_MS = 60_000;

export interface PricedItem {
  name: string;
  whiteMarket: MarketQuote | null;
  dmarket: MarketQuote | null;
}

export interface MarketSyncState {
  updatedAt: string | null;
  items: number;
  error: string | null;
}

interface Snapshot {
  whiteMarket: Record<string, WhiteMarketPrice>;
  dmarket: Record<string, DmarketPrice>;
  whiteMarketAt: string | null;
  dmarketAt: string | null;
}

/**
 * Keeps the latest prices of both markets in memory. Every few minutes it pulls
 * the white.market price list, then asks DMarket about every known item name.
 */
@Injectable()
export class PriceBoardService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PriceBoardService.name);
  private readonly cache: DiskCache;
  private whiteMarket = new Map<string, WhiteMarketPrice>();
  private dmarket = new Map<string, DmarketPrice>();
  private items: PricedItem[] = [];
  private byName = new Map<string, PricedItem>();
  private whiteMarketState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private dmarketState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private refreshing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private currentVersion = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
    private readonly catalog: CatalogService,
    private readonly whiteMarketExport: WhiteMarketExportClient,
    private readonly dmarketPrices: DmarketPricesClient,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  /** Changes whenever prices change, so readers can rebuild their indexes lazily. */
  get version(): number {
    return this.currentVersion;
  }

  get isRefreshing(): boolean {
    return this.refreshing !== null;
  }

  get state(): { whiteMarket: MarketSyncState; dmarket: MarketSyncState } {
    return { whiteMarket: this.whiteMarketState, dmarket: this.dmarketState };
  }

  all(): readonly PricedItem[] {
    return this.items;
  }

  /** Raw white.market price-list row, which also carries the float of the cheapest listing. */
  whiteMarketPrice(name: string): WhiteMarketPrice | undefined {
    return this.whiteMarket.get(name);
  }

  find(name: string): PricedItem | undefined {
    return this.byName.get(name);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.restore();

    void this.catalog.start().catch((error: unknown) => {
      this.logger.warn(`Catalog start failed: ${String(error)}`);
    });
    void this.refresh();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  /** Re-reads one item from DMarket so an opened card shows the freshest numbers. */
  async refreshItem(name: string): Promise<PricedItem | undefined> {
    const fresh = await this.dmarketPrices.fetchPrices([name]);
    const price = fresh.get(name);

    if (price) {
      this.dmarket.set(name, price);
      this.rebuild();
    }

    return this.find(name);
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.pull()
      .then(() => this.schedule(this.sync.pricesRefreshMs))
      .catch((error: unknown) => {
        this.logger.warn(`Price refresh failed: ${String(error)}`);
        this.schedule(RETRY_AFTER_FAILURE_MS);
      })
      .finally(() => {
        this.refreshing = null;
      });

    return this.refreshing;
  }

  private async pull(): Promise<void> {
    const started = Date.now();

    try {
      this.whiteMarket = await this.whiteMarketExport.fetchPrices();
      this.whiteMarketState = {
        updatedAt: new Date().toISOString(),
        items: this.whiteMarket.size,
        error: null,
      };
      this.rebuild();
    } catch (error) {
      this.whiteMarketState = { ...this.whiteMarketState, error: String(error) };
      this.logger.warn(`white.market prices failed: ${String(error)}`);
    }

    const names = [...new Set([...this.whiteMarket.keys(), ...this.catalog.names()])];

    try {
      this.dmarket = await this.dmarketPrices.fetchPrices(names, 'background');
      this.dmarketState = {
        updatedAt: new Date().toISOString(),
        items: [...this.dmarket.values()].filter((price) => price.listings > 0).length,
        error: null,
      };
      this.rebuild();
    } catch (error) {
      this.dmarketState = { ...this.dmarketState, error: String(error) };
      this.logger.warn(`DMarket prices failed: ${String(error)}`);
    }

    await this.persist();
    this.logger.log(
      `Prices refreshed in ${Math.round((Date.now() - started) / 1000)}s: ${this.items.length} items`,
    );
  }

  private rebuild(): void {
    const names = new Set([...this.whiteMarket.keys(), ...this.dmarket.keys()]);
    const items: PricedItem[] = [];

    for (const name of names) {
      const whiteMarket = this.toWhiteMarketQuote(name);
      const dmarket = this.toDmarketQuote(name);

      if (whiteMarket || dmarket) {
        items.push({ name, whiteMarket, dmarket });
      }
    }

    this.items = items;
    this.byName = new Map(items.map((item) => [item.name, item]));
    this.currentVersion += 1;
  }

  private toWhiteMarketQuote(name: string): MarketQuote | null {
    const price = this.whiteMarket.get(name);

    return price
      ? { price: price.price, listings: price.listings, bid: null, bids: 0, url: price.url }
      : null;
  }

  private toDmarketQuote(name: string): MarketQuote | null {
    const price = this.dmarket.get(name);

    if (!price || (price.listings === 0 && price.bids === 0)) {
      return null;
    }

    return { ...price, url: dmarketItemUrl(name) };
  }

  private async restore(): Promise<void> {
    const cached = await this.cache.read<Snapshot>(CACHE_KEY);

    if (!cached) {
      return;
    }

    const { value } = cached;

    this.whiteMarket = new Map(Object.entries(value.whiteMarket));
    this.dmarket = new Map(Object.entries(value.dmarket));
    this.whiteMarketState = {
      updatedAt: value.whiteMarketAt,
      items: this.whiteMarket.size,
      error: null,
    };
    this.dmarketState = {
      updatedAt: value.dmarketAt,
      items: [...this.dmarket.values()].filter((price) => price.listings > 0).length,
      error: null,
    };
    this.rebuild();
    this.logger.log(`Prices restored from disk: ${this.items.length} items`);
  }

  private async persist(): Promise<void> {
    try {
      await this.cache.write<Snapshot>(CACHE_KEY, {
        whiteMarket: Object.fromEntries(this.whiteMarket),
        dmarket: Object.fromEntries(this.dmarket),
        whiteMarketAt: this.whiteMarketState.updatedAt,
        dmarketAt: this.dmarketState.updatedAt,
      });
    } catch (error) {
      this.logger.warn(`Could not save prices to disk: ${String(error)}`);
    }
  }

  private schedule(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => void this.refresh(), delayMs);
    this.timer.unref();
  }
}
