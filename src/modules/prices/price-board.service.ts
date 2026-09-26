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
import { type MarketQuote, type MarketQuotes } from '../../domain/comparison';
import { csfloatItemUrl, dmarketItemUrl } from '../../domain/market-links';
import { parseVariantName, variantName } from '../../domain/market-variant';
import { hasDopplerPhases, summarizePhaseDepth, type PhaseQuote } from '../../domain/phase-prices';
import { CatalogService } from '../catalog/catalog.service';
import { DmarketDepthClient } from '../dmarket/dmarket-depth.client';
import { type RequestPriority } from '../dmarket/dmarket-rate-limiter';
import { DmarketPricesClient, type DmarketPrice } from '../dmarket/dmarket-prices.client';
import { CsfloatClient, type CsfloatPrice } from '../csfloat/csfloat.client';
import { LisSkinsClient, type LisSkinsPrice } from '../lis-skins/lis-skins.client';
import {
  WhiteMarketExportClient,
  type WhiteMarketPrice,
} from '../white-market/white-market-export.client';

const CACHE_KEY = 'prices';
const RETRY_AFTER_FAILURE_MS = 60_000;
const CSFLOAT_PHASE_PAUSE_MS = 1_500;

export interface PricedItem extends MarketQuotes {
  name: string;
}

export interface MarketSyncState {
  updatedAt: string | null;
  items: number;
  error: string | null;
}

interface Snapshot {
  version?: number;
  whiteMarket: Record<string, WhiteMarketPrice>;
  dmarket: Record<string, DmarketPrice>;
  csfloat?: Record<string, CsfloatPrice>;
  dmarketPhases?: Record<string, PhaseQuote>;
  lisSkins?: Record<string, LisSkinsPrice>;
  whiteMarketAt: string | null;
  dmarketAt: string | null;
  csfloatAt?: string | null;
  lisSkinsAt?: string | null;
}

@Injectable()
export class PriceBoardService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PriceBoardService.name);
  private readonly cache: DiskCache;
  private whiteMarket = new Map<string, WhiteMarketPrice>();
  private dmarket = new Map<string, DmarketPrice>();
  private csfloat = new Map<string, CsfloatPrice>();
  private dmarketPhases = new Map<string, PhaseQuote>();
  private lisSkins = new Map<string, LisSkinsPrice>();
  private items: PricedItem[] = [];
  private byName = new Map<string, PricedItem>();
  private whiteMarketState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private dmarketState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private csfloatState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private lisSkinsState: MarketSyncState = { updatedAt: null, items: 0, error: null };
  private refreshing: Promise<void> | null = null;
  private csfloatPhasesRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private currentVersion = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
    private readonly catalog: CatalogService,
    private readonly whiteMarketExport: WhiteMarketExportClient,
    private readonly dmarketPrices: DmarketPricesClient,
    private readonly dmarketDepth: DmarketDepthClient,
    private readonly csfloatClient: CsfloatClient,
    private readonly lisSkinsClient: LisSkinsClient,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  get version(): number {
    return this.currentVersion;
  }

  get isRefreshing(): boolean {
    return this.refreshing !== null;
  }

  get state(): {
    whiteMarket: MarketSyncState;
    dmarket: MarketSyncState;
    csfloat: MarketSyncState;
    lisSkins: MarketSyncState;
  } {
    return {
      whiteMarket: this.whiteMarketState,
      dmarket: this.dmarketState,
      csfloat: this.csfloatState,
      lisSkins: this.lisSkinsState,
    };
  }

  all(): readonly PricedItem[] {
    return this.items;
  }

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

  async refreshItem(name: string): Promise<PricedItem | undefined> {
    const { marketHashName, phase } = parseVariantName(name);
    const [fresh, csfloatListings] = await Promise.all([
      hasDopplerPhases(marketHashName)
        ? this.refreshPhases([marketHashName], 'interactive').then(
            () => new Map<string, DmarketPrice>(),
          )
        : this.dmarketPrices.fetchPrices([marketHashName]),
      this.csfloatClient.isEnabled
        ? this.csfloatClient.searchListings({ name: marketHashName, phase })
        : Promise.resolve([]),
    ]);
    const price = fresh.get(marketHashName);

    if (price) {
      this.dmarket.set(marketHashName, price);
      this.rebuild();
    }

    if (csfloatListings.length > 0) {
      this.csfloat.set(name, {
        price: csfloatListings[0].price,
        listings: csfloatListings.length,
        url: csfloatListings[0].url,
      });
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

    try {
      const csfloat = await this.csfloatClient.fetchPrices();

      for (const [name, price] of this.csfloat) {
        if (parseVariantName(name).phase && !csfloat.has(name)) {
          csfloat.set(name, price);
        }
      }

      this.csfloat = csfloat;
      this.csfloatState = {
        updatedAt: new Date().toISOString(),
        items: this.csfloat.size,
        error: null,
      };
      this.rebuild();
    } catch (error) {
      this.csfloatState = { ...this.csfloatState, error: String(error) };
      this.logger.warn(`CSFloat prices failed: ${String(error)}`);
    }

    try {
      this.lisSkins = await this.lisSkinsClient.fetchPrices();
      this.lisSkinsState = {
        updatedAt: new Date().toISOString(),
        items: this.lisSkins.size,
        error: null,
      };
      this.rebuild();
    } catch (error) {
      this.lisSkinsState = { ...this.lisSkinsState, error: String(error) };
      this.logger.warn(`lis-skins prices failed: ${String(error)}`);
    }

    const names = [
      ...new Set([
        ...[...this.whiteMarket.keys()].map((name) => parseVariantName(name).marketHashName),
        ...this.catalog.names(),
      ]),
    ];

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

    await this.refreshPhases([...this.dmarket.keys()].filter(hasDopplerPhases), 'background');
    void this.refreshCsfloatPhases();

    await this.persist();
    this.logger.log(
      `Prices refreshed in ${Math.round((Date.now() - started) / 1000)}s: ${this.items.length} items`,
    );
  }

  private rebuild(): void {
    const names = new Set([
      ...this.whiteMarket.keys(),
      ...this.dmarket.keys(),
      ...this.dmarketPhases.keys(),
      ...this.csfloat.keys(),
      ...this.lisSkins.keys(),
    ]);
    const items: PricedItem[] = [];

    for (const name of names) {
      const whiteMarket = this.toWhiteMarketQuote(name);
      const dmarket = this.toDmarketQuote(name);
      const csfloat = this.toCsfloatQuote(name);
      const lisSkins = this.toLisSkinsQuote(name);

      if (whiteMarket || dmarket || csfloat || lisSkins) {
        items.push({ name, whiteMarket, dmarket, csfloat, lisSkins });
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
    const variant = parseVariantName(name);
    const price =
      this.dmarketPhases.get(name) ??
      (variant.phase || hasDopplerPhases(name) ? undefined : this.dmarket.get(name));

    if (!price || (price.listings === 0 && price.bids === 0)) {
      return null;
    }

    return { ...price, url: dmarketItemUrl(variant.marketHashName) };
  }

  private toCsfloatQuote(name: string): MarketQuote | null {
    const variant = parseVariantName(name);

    const price = this.csfloat.get(variant.phase ? name : variant.marketHashName);

    return price
      ? {
          price: price.price,
          listings: price.listings,
          bid: null,
          bids: 0,
          url: price.url ?? csfloatItemUrl(variant.marketHashName),
        }
      : null;
  }

  private toLisSkinsQuote(name: string): MarketQuote | null {
    const price = this.lisSkins.get(name);

    return price
      ? { price: price.price, listings: price.listings, bid: null, bids: 0, url: price.url }
      : null;
  }

  private async refreshCsfloatPhases(): Promise<void> {
    if (!this.csfloatClient.isEnabled || this.csfloatPhasesRunning) {
      return;
    }

    this.csfloatPhasesRunning = true;
    const titles = [...this.csfloat.keys()].filter(
      (name) => !parseVariantName(name).phase && hasDopplerPhases(name),
    );
    let found = 0;

    try {
      for (const title of titles) {
        try {
          const listings = await this.csfloatClient.searchListings({ name: title });
          const byPhase = new Map<string, CsfloatPrice>();

          for (const listing of listings) {
            if (!listing.phase) continue;

            const key = variantName(title, listing.phase);
            const current = byPhase.get(key);

            byPhase.set(key, {
              price: Math.min(current?.price ?? Infinity, listing.price),
              listings: (current?.listings ?? 0) + 1,
              url: current && current.price <= listing.price ? current.url : listing.url,
            });
          }

          for (const [key, price] of byPhase) {
            this.csfloat.set(key, price);
          }

          found += byPhase.size;
        } catch (error) {
          this.logger.warn(`CSFloat phases for "${title}" failed: ${String(error)}`);
        }

        await wait(CSFLOAT_PHASE_PAUSE_MS);
      }

      this.rebuild();
      this.logger.log(`CSFloat phase prices: ${found} phases in ${titles.length} titles`);
    } finally {
      this.csfloatPhasesRunning = false;
    }
  }

  private async refreshPhases(titles: string[], priority: RequestPriority): Promise<void> {
    let failed = 0;

    for (const title of titles) {
      try {
        const { offers, orders } = await this.dmarketDepth.fetch(title, priority);
        const { common, phases } = summarizePhaseDepth(offers, orders);

        for (const key of [...this.dmarketPhases.keys()]) {
          if (parseVariantName(key).marketHashName === title) {
            this.dmarketPhases.delete(key);
          }
        }

        this.dmarketPhases.set(title, common);

        for (const [phase, quote] of phases) {
          this.dmarketPhases.set(variantName(title, phase), quote);
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(`DMarket phases for "${title}" failed: ${String(error)}`);
      }
    }

    if (titles.length > 0) {
      this.rebuild();
      this.logger.log(`DMarket phase prices: ${titles.length - failed}/${titles.length} titles`);
    }
  }

  private async restore(): Promise<void> {
    const cached = await this.cache.read<Snapshot>(CACHE_KEY);

    if (!cached) {
      return;
    }

    const { value } = cached;

    this.whiteMarket =
      (value.version ?? 0) >= 2
        ? new Map(Object.entries(value.whiteMarket))
        : new Map<string, WhiteMarketPrice>();
    this.dmarket = new Map(Object.entries(value.dmarket));
    this.csfloat = new Map(Object.entries(value.csfloat ?? {}));
    this.dmarketPhases = new Map(Object.entries(value.dmarketPhases ?? {}));
    this.lisSkins = new Map(Object.entries(value.lisSkins ?? {}));
    this.lisSkinsState = {
      updatedAt: value.lisSkinsAt ?? null,
      items: this.lisSkins.size,
      error: null,
    };
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
    this.csfloatState = {
      updatedAt: value.csfloatAt ?? null,
      items: this.csfloat.size,
      error: null,
    };
    this.rebuild();
    this.logger.log(`Prices restored from disk: ${this.items.length} items`);
  }

  private async persist(): Promise<void> {
    try {
      await this.cache.write<Snapshot>(CACHE_KEY, {
        version: 3,
        whiteMarket: Object.fromEntries(this.whiteMarket),
        dmarket: Object.fromEntries(this.dmarket),
        csfloat: Object.fromEntries(this.csfloat),
        dmarketPhases: Object.fromEntries(this.dmarketPhases),
        lisSkins: Object.fromEntries(this.lisSkins),
        lisSkinsAt: this.lisSkinsState.updatedAt,
        whiteMarketAt: this.whiteMarketState.updatedAt,
        dmarketAt: this.dmarketState.updatedAt,
        csfloatAt: this.csfloatState.updatedAt,
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
