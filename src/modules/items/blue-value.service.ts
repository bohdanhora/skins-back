import { BadRequestException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { DiskCache } from '../../common/cache/disk-cache';
import { appConfig, type AppConfig } from '../../config/app.config';
import { caseHardenedWeapon, weaponBlueShare, type BlueShare } from '../../domain/blue-gem';
import {
  compareBlue,
  saleRatio,
  sameSkinOtherWears,
  type PatternSale,
} from '../../domain/blue-value';
import { MarketId } from '../../domain/market-links';
import { CatalogService } from '../catalog/catalog.service';
import { CsfloatClient, type CsfloatBlue, type CsfloatSale } from '../csfloat/csfloat.client';
import { PriceBoardService } from '../prices/price-board.service';
import type { BlueValueDto } from './dto/blue-value.dto';

const BLUES_KEY = 'csfloat-blue';
const SALES_TTL_MS = 60 * 60_000;
const LOOKUP_TTL_MS = 60 * 60_000;
const CASE_HARDENED_PAINT_INDEX = 44;
const SHOWN_SALES = 8;

@Injectable()
export class BlueValueService implements OnModuleInit {
  private readonly logger = new Logger(BlueValueService.name);
  private readonly cache: DiskCache;
  private readonly blues = new Map<string, CsfloatBlue>();
  private readonly sales = new Map<string, { at: number; rows: CsfloatSale[] }>();
  private readonly lookups = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(appConfig.KEY) app: AppConfig,
    private readonly board: PriceBoardService,
    private readonly csfloat: CsfloatClient,
    private readonly catalog: CatalogService,
  ) {
    this.cache = new DiskCache(app.cacheDir);
  }

  async onModuleInit(): Promise<void> {
    const stored = await this.cache.read<Record<string, CsfloatBlue>>(BLUES_KEY);

    for (const [key, blue] of Object.entries(stored?.value ?? {})) {
      this.blues.set(key, blue);
    }
  }

  async value(name: string, paintSeed: number): Promise<BlueValueDto> {
    const weapon = caseHardenedWeapon(name);

    if (!weapon) {
      throw new BadRequestException('Only Case Hardened items have a blue share');
    }

    const names = sameSkinOtherWears(name, [
      name,
      ...this.board.all().map((item) => item.name),
    ]).filter((entry, index, all) => all.indexOf(entry) === index);
    const sales = this.csfloat.isEnabled ? await this.salesFor(names) : [];

    this.learn(weapon, sales);

    const known =
      this.blues.get(blueKey(weapon, paintSeed)) ?? (await this.lookupSeed(weapon, paintSeed));
    const source = known ? 'csfloat' : 'calculator';
    const blue: BlueShare | null = known ?? weaponBlueShare(weapon, paintSeed);

    if (!blue) {
      throw new BadRequestException('Unknown pattern');
    }

    const patternSales = sales.flatMap((sale): PatternSale[] => {
      const saleBlue = known ? sale.blue : weaponBlueShare(weapon, sale.paintSeed);

      return saleBlue ? [{ ...sale, blue: saleBlue }] : [];
    });
    const comparison = compareBlue(patternSales, blue);
    const market = this.marketPrice(name);
    const estimate =
      comparison.multiplier !== null && market !== null
        ? Math.round(market * comparison.multiplier)
        : null;

    return {
      blue,
      source,
      market,
      multiplier: comparison.multiplier,
      estimate,
      premium: estimate !== null && market !== null ? estimate - market : null,
      band: comparison.band,
      comparableCount: comparison.comparable.length,
      checked: comparison.checked,
      spanDays: comparison.spanDays,
      sales: comparison.comparable.slice(0, SHOWN_SALES).map((sale) => ({
        name: sale.name,
        price: sale.price,
        ratio: comparison.baseline ? saleRatio(sale) / comparison.baseline : saleRatio(sale),
        paintSeed: sale.paintSeed,
        float: sale.float,
        blue: sale.blue,
        soldAt: sale.soldAt,
      })),
    };
  }

  private marketPrice(name: string): number | null {
    const item = this.board.find(name);
    const prices = Object.values(MarketId)
      .map((market) => item?.[market])
      .filter((quote) => quote && quote.listings > 0 && quote.price !== null && quote.price > 0)
      .map((quote) => quote!.price!);

    return prices.length > 0 ? Math.min(...prices) : null;
  }

  private async salesFor(names: string[]): Promise<CsfloatSale[]> {
    const rows: CsfloatSale[] = [];

    for (const name of names) {
      rows.push(...(await this.salesOf(name)));
    }

    return rows;
  }

  private salesOf(name: string): Promise<CsfloatSale[]> {
    const cached = this.sales.get(name);

    if (cached && Date.now() - cached.at < SALES_TTL_MS) {
      return Promise.resolve(cached.rows);
    }

    return this.enqueue(async () => {
      try {
        const rows = await this.csfloat.fetchRecentSales(name);

        this.sales.set(name, { at: Date.now(), rows });
        return rows;
      } catch (error) {
        this.logger.warn(`CSFloat sales for "${name}" failed: ${String(error)}`);
        return cached?.rows ?? [];
      }
    });
  }

  private async lookupSeed(weapon: string, paintSeed: number): Promise<CsfloatBlue | null> {
    const key = blueKey(weapon, paintSeed);
    const checkedAt = this.lookups.get(key);
    const defIndex = this.catalog
      .skins()
      .find((skin) => caseHardenedWeapon(skin.name) === weapon)?.weaponIndex;

    if (
      !this.csfloat.isEnabled ||
      defIndex === undefined ||
      defIndex === null ||
      (checkedAt !== undefined && Date.now() - checkedAt < LOOKUP_TTL_MS)
    ) {
      return null;
    }

    this.lookups.set(key, Date.now());

    return this.enqueue(async () => {
      try {
        const listings = await this.csfloat.searchPatternListings({
          defIndex,
          paintIndex: CASE_HARDENED_PAINT_INDEX,
          paintSeed,
        });

        this.learn(weapon, listings);
      } catch (error) {
        this.logger.warn(`CSFloat pattern ${weapon} #${paintSeed} failed: ${String(error)}`);
      }

      return this.blues.get(key) ?? null;
    });
  }

  private learn(weapon: string, rows: { paintSeed: number; blue: CsfloatBlue | null }[]): void {
    let added = false;

    for (const row of rows) {
      const key = blueKey(weapon, row.paintSeed);

      if (row.blue && !this.blues.has(key)) {
        this.blues.set(key, row.blue);
        added = true;
      }
    }

    if (added) {
      void this.cache.write(BLUES_KEY, Object.fromEntries(this.blues)).catch(() => undefined);
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);

    this.queue = next.catch(() => undefined);
    return next;
  }
}

const blueKey = (weapon: string, paintSeed: number): string => `${weapon}|${paintSeed}`;
