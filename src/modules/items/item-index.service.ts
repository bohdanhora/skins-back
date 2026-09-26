import { Injectable } from '@nestjs/common';

import { ItemCategory, detectCategory, detectSubcategory } from '../../domain/categories';
import { cheapestPrice, type MarketQuote } from '../../domain/comparison';
import { parseVariantName, type MarketPhase } from '../../domain/market-variant';
import { CatalogService } from '../catalog/catalog.service';
import { PriceBoardService } from '../prices/price-board.service';

export interface IndexedItem {
  name: string;
  searchName: string;
  image: string | null;
  rarity: string | null;
  rarityColor: string | null;
  category: ItemCategory;
  subcategory: string | null;
  phase: MarketPhase | null;
  collections: { name: string; image: string | null }[];
  whiteMarket: MarketQuote | null;
  dmarket: MarketQuote | null;
  csfloat: MarketQuote | null;
  lisSkins: MarketQuote | null;
  priceChangedAt: number | null;
}

@Injectable()
export class ItemIndexService {
  private rows: IndexedItem[] = [];
  private byName = new Map<string, IndexedItem>();
  private builtFor = { prices: -1, catalog: -1 };

  constructor(
    private readonly board: PriceBoardService,
    private readonly catalog: CatalogService,
  ) {}

  all(): readonly IndexedItem[] {
    this.ensureFresh();
    return this.rows;
  }

  find(name: string): IndexedItem | undefined {
    this.ensureFresh();
    return this.byName.get(name);
  }

  cheapestPrice(name: string): number | null {
    const item = this.find(name);

    return item ? cheapestPrice(item) : null;
  }

  subcategories(): Record<string, { value: string; image: string | null; count: number }[]> {
    this.ensureFresh();
    const groups = new Map<string, Map<string, { image: string | null; count: number }>>();

    for (const item of this.rows) {
      if (!item.subcategory) continue;

      const group =
        groups.get(item.category) ?? new Map<string, { image: string | null; count: number }>();
      const entry = group.get(item.subcategory) ?? { image: null, count: 0 };

      group.set(item.subcategory, { image: entry.image ?? item.image, count: entry.count + 1 });
      groups.set(item.category, group);
    }

    return Object.fromEntries(
      [...groups].map(([category, group]) => [
        category,
        [...group]
          .map(([value, entry]) => ({ value, ...entry }))
          .sort((left, right) => left.value.localeCompare(right.value)),
      ]),
    );
  }

  collections(): { name: string; image: string | null }[] {
    this.ensureFresh();
    const values = new Map<string, string | null>();

    for (const item of this.rows) {
      for (const collection of item.collections) {
        values.set(collection.name, collection.image);
      }
    }

    return [...values]
      .map(([name, image]) => ({ name, image }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private ensureFresh(): void {
    if (
      this.builtFor.prices === this.board.version &&
      this.builtFor.catalog === this.catalog.version
    ) {
      return;
    }

    this.rows = this.board.all().map((item) => {
      const variant = parseVariantName(item.name);
      const metadata = this.catalog.get(variant.marketHashName);
      const category = detectCategory(item.name, metadata?.type);

      return {
        name: item.name,
        searchName: item.name.toLowerCase(),
        image:
          (variant.phase && this.catalog.phaseImage(variant.marketHashName, variant.phase)) ??
          metadata?.image ??
          null,
        rarity: metadata?.rarity ?? null,
        rarityColor: metadata?.rarityColor ?? null,
        category,
        subcategory: detectSubcategory(item.name, category),
        phase: variant.phase,
        collections: metadata?.collections ?? [],
        whiteMarket: item.whiteMarket,
        dmarket: item.dmarket,
        csfloat: item.csfloat,
        lisSkins: item.lisSkins,
        priceChangedAt: this.board.priceChangedAt(item.name),
      };
    });
    this.byName = new Map(this.rows.map((row) => [row.name, row]));
    this.builtFor = { prices: this.board.version, catalog: this.catalog.version };
  }
}
