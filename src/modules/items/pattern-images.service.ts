import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { fetchText } from '../../common/http/fetch-json';
import { appConfig, type AppConfig } from '../../config/app.config';
import { blueGemPoses, blueShare } from '../../domain/blue-gem';
import { parseVariantName } from '../../domain/market-variant';
import { skinBaseName } from '../../domain/skin-name';
import { CatalogService } from '../catalog/catalog.service';
import { type PatternImagesDto } from './dto/pattern-images.dto';
import { PATTERN_IMAGE_BASE, parsePatternImages, patternPageUrl } from './pattern-images';

const CACHE_TTL_MS = 14 * 24 * 60 * 60_000;
const MAX_SEED = 1000;

@Injectable()
export class PatternImagesService {
  private readonly logger = new Logger(PatternImagesService.name);
  private readonly cache: DiskCache;
  private readonly loading = new Map<string, Promise<Record<string, string>>>();

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    private readonly catalog: CatalogService,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  async images(name: string): Promise<PatternImagesDto> {
    const variant = parseVariantName(name);
    const base = skinBaseName(variant.marketHashName);
    const skin = this.catalog.skin(base);
    const patternId = (variant.phase && skin?.phasePatternIds[variant.phase]) || skin?.patternId;

    if (!skin || !patternId) {
      throw new NotFoundException(`No pattern data for "${name}"`);
    }

    const pageUrl = patternPageUrl(patternId, skin.weaponId);
    const images = await this.load(`${patternId}/${skin.weaponId}`, pageUrl);
    const seeds = Array.from({ length: MAX_SEED + 1 }, (_, seed) => images[String(seed)] ?? '');

    return {
      name: base,
      pageUrl,
      imageBase: PATTERN_IMAGE_BASE,
      images: seeds,
      blue: seeds.map((_, seed) => blueShare(base, seed)),
      poses: blueGemPoses(base),
    };
  }

  private load(slug: string, pageUrl: string): Promise<Record<string, string>> {
    const running = this.loading.get(slug);

    if (running) return running;

    const key = `pattern-wiki-${slug.replace(/[^a-z0-9_]+/gi, '-')}`;
    const request = (async () => {
      const cached = await this.cache.read<Record<string, string>>(key);

      if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        return cached.value;
      }

      try {
        const images = parsePatternImages(
          await fetchText(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkinScout/1.0)' },
            retries: 1,
          }),
        );

        if (Object.keys(images).length > 0) {
          await this.cache.write(key, images);
        }

        return images;
      } catch (error) {
        this.logger.warn(`pattern.wiki page ${pageUrl} failed: ${String(error)}`);

        if (cached) return cached.value;

        throw error;
      }
    })().finally(() => this.loading.delete(slug));

    this.loading.set(slug, request);

    return request;
  }
}
