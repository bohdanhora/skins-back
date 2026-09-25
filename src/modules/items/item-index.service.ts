import { Injectable } from '@nestjs/common';

import { ItemCategory, detectCategory } from '../../domain/categories';
import { type MarketQuote } from '../../domain/comparison';
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
  phase: MarketPhase | null;
  collections: { name: string; image: string | null }[];
  whiteMarket: MarketQuote | null;
  dmarket: MarketQuote | null;
  csfloat: MarketQuote | null;
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
    const prices = [item?.whiteMarket, item?.dmarket, item?.csfloat]
      .filter(
        (quote): quote is MarketQuote => !!quote && quote.listings > 0 && quote.price !== null,
      )
      .map((quote) => quote.price!);

    return prices.length > 0 ? Math.min(...prices) : null;
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

      return {
        name: item.name,
        searchName: item.name.toLowerCase(),
        image: metadata?.image ?? null,
        rarity: metadata?.rarity ?? null,
        rarityColor: metadata?.rarityColor ?? null,
        category: detectCategory(item.name, metadata?.type),
        phase: variant.phase,
        collections: metadata?.collections ?? [],
        whiteMarket: item.whiteMarket,
        dmarket: item.dmarket,
        csfloat: item.csfloat,
      };
    });
    this.byName = new Map(this.rows.map((row) => [row.name, row]));
    this.builtFor = { prices: this.board.version, catalog: this.catalog.version };
  }
}
