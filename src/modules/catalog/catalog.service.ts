import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { fetchJson } from '../../common/http/fetch-json';
import { appConfig, syncConfig, type AppConfig, type SyncConfig } from '../../config/app.config';
import { paintIndexForPhase, type MarketPhase } from '../../domain/market-variant';

const METADATA_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json';
const SKINS_URL =
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const METADATA_TIMEOUT_MS = 180_000;
const CACHE_KEY = 'catalog-v2';
const PHASE_IMAGES_KEY = 'catalog-phase-images-v2';
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;

export interface ItemMetadata {
  image: string | null;
  rarityColor: string | null;
  rarity: string | null;
  type: string;
  collections: { name: string; image: string | null }[];
}

interface RawMetadataEntry {
  id?: string;
  market_hash_name?: string | null;
  image?: string | null;
  rarity?: { name?: string; color?: string } | null;
  skin_id?: string;
}

interface RawSkinEntry {
  id?: string;
  name?: string;
  image?: string | null;
  paint_index?: string | number | null;
  phase?: string | null;
  collections?: { name?: string; image?: string | null }[];
}

const WEAR_SUFFIX = / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

const phaseImageKey = (base: string, paintIndex: number): string => `${base}#${paintIndex}`;

@Injectable()
export class CatalogService implements OnModuleDestroy {
  private readonly logger = new Logger(CatalogService.name);
  private readonly cache: DiskCache;
  private entries = new Map<string, ItemMetadata>();
  private phaseImages = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private loading: Promise<void> | null = null;
  private currentVersion = 0;

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    @Inject(syncConfig.KEY) private readonly sync: SyncConfig,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  get size(): number {
    return this.entries.size;
  }

  get version(): number {
    return this.currentVersion;
  }

  get(name: string): ItemMetadata | undefined {
    return this.entries.get(name);
  }

  phaseImage(marketHashName: string, phase: MarketPhase): string | null {
    const base = marketHashName
      .replace(WEAR_SUFFIX, '')
      .replace('StatTrak™ ', '')
      .replace(/^Souvenir /, '');
    const paintIndex = paintIndexForPhase(marketHashName, phase);

    return paintIndex === null
      ? null
      : (this.phaseImages.get(phaseImageKey(base, paintIndex)) ?? null);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  async start(): Promise<void> {
    const cached = await this.cache.read<Record<string, ItemMetadata>>(CACHE_KEY);
    const phaseImages = await this.cache.read<Record<string, string>>(PHASE_IMAGES_KEY);

    if (phaseImages) {
      this.phaseImages = new Map(Object.entries(phaseImages.value));
    }

    if (cached) {
      this.entries = new Map(Object.entries(cached.value));
      this.currentVersion += 1;
      this.logger.log(`Catalog restored from disk: ${this.entries.size} items`);
    }

    const age = cached && phaseImages ? Date.now() - cached.savedAt : Infinity;

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
    const [raw, skins] = await Promise.all([
      fetchJson<Record<string, RawMetadataEntry>>(METADATA_URL, {
        timeoutMs: METADATA_TIMEOUT_MS,
      }),
      fetchJson<RawSkinEntry[]>(SKINS_URL, { timeoutMs: METADATA_TIMEOUT_MS }),
    ]);
    const collectionsBySkin = new Map(
      skins.map((skin) => [
        skin.id,
        (skin.collections ?? []).flatMap((collection) =>
          collection.name ? [{ name: collection.name, image: collection.image ?? null }] : [],
        ),
      ]),
    );
    const entries = new Map<string, ItemMetadata>();
    const phaseImages = new Map<string, string>();

    for (const skin of skins) {
      const paintIndex = Number(skin.paint_index);
      const base = skin.phase ? skin.name : undefined;

      if (base && skin.image && Number.isFinite(paintIndex)) {
        phaseImages.set(phaseImageKey(base, paintIndex), skin.image);
      }
    }

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
        collections: collectionsBySkin.get(entry.skin_id) ?? [],
      });
    }

    this.entries = entries;
    this.phaseImages = phaseImages;
    this.currentVersion += 1;
    await this.cache.write(CACHE_KEY, Object.fromEntries(entries));
    await this.cache.write(PHASE_IMAGES_KEY, Object.fromEntries(phaseImages));
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
