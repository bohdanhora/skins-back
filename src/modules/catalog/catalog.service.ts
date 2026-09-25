import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { fetchJson } from '../../common/http/fetch-json';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';

/** Community maintained CS2 item database: names, pictures and rarities. */
const METADATA_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json';
const METADATA_TIMEOUT_MS = 180_000;
const CACHE_KEY = 'catalog';
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

export interface ItemMetadata {
  image: string | null;
  rarityColor: string | null;
  rarity: string | null;
  /** Prefix of the source id: skin, agent, sticker, crate and so on. */
  type: string;
}

interface RawMetadataEntry {
  id?: string;
  market_hash_name?: string | null;
  image?: string | null;
  rarity?: { name?: string; color?: string } | null;
}

@Injectable()
export class CatalogService implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogService.name);
  private readonly cache: DiskCache;
  private entries = new Map<string, ItemMetadata>();
  private timer: NodeJS.Timeout | null = null;
  private loading: Promise<void> | null = null;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  get size(): number {
    return this.entries.size;
  }

  get(name: string): ItemMetadata | undefined {
    return this.entries.get(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** Loads from disk first, then refreshes in the background when the copy is stale. */
  async start(): Promise<void> {
    const cached = await this.cache.read<Record<string, ItemMetadata>>(CACHE_KEY);

    if (cached) {
      this.entries = new Map(Object.entries(cached.value));
      this.logger.log(`Catalog restored from disk: ${this.entries.size} items`);
    }

    const age = cached ? Date.now() - cached.savedAt : Infinity;

    if (age >= this.sync.catalogRefreshMs) {
      await this.refresh();
    } else {
      this.schedule(this.sync.catalogRefreshMs - age);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private refresh(): Promise<void> {
    this.loading ??= this.download()
      .then(() => this.schedule(this.sync.catalogRefreshMs))
      .catch((error: unknown) => {
        this.logger.warn(`Catalog refresh failed: ${String(error)}`);
        this.schedule(RETRY_AFTER_FAILURE_MS);
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  private async download(): Promise<void> {
    const raw = await fetchJson<Record<string, RawMetadataEntry>>(METADATA_URL, {
      timeoutMs: METADATA_TIMEOUT_MS,
    });
    const entries = new Map<string, ItemMetadata>();

    for (const entry of Object.values(raw)) {
      const name = entry.market_hash_name;

      if (!name || entries.has(name)) {
        continue;
      }

      entries.set(name, {
        image: entry.image ?? null,
        rarityColor: entry.rarity?.color ?? null,
        rarity: entry.rarity?.name ?? null,
        type: (entry.id ?? '').split('-')[0],
      });
    }

    this.entries = entries;
    await this.cache.write(CACHE_KEY, Object.fromEntries(entries));
    this.logger.log(`Catalog downloaded: ${entries.size} items`);
  }

  private schedule(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => void this.refresh(), delayMs);
    this.timer.unref();
  }
}
