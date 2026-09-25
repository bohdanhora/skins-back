import { Injectable } from '@nestjs/common';

import { ItemCategory, detectCategory } from '../../domain/categories';
import { type MarketQuote } from '../../domain/comparison';
import { CatalogService } from '../catalog/catalog.service';
import { PriceBoardService } from '../prices/price-board.service';

export interface IndexedItem {
  name: string;
  /** Lowercased name for matching search words. */
  searchName: string;
  image: string | null;
  rarity: string | null;
  rarityColor: string | null;
  category: ItemCategory;
  whiteMarket: MarketQuote | null;
  dmarket: MarketQuote | null;
}

/** Joins prices with pictures and categories, rebuilt only when either source changes. */
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

  /** Cheapest current price of an item on either market, used to value applied stickers. */
  cheapestPrice(name: string): number | null {
    const item = this.find(name);
    const prices = [item?.whiteMarket, item?.dmarket]
      .filter(
        (quote): quote is MarketQuote => !!quote && quote.listings > 0 && quote.price !== null,
      )
      .map((quote) => quote.price!);

    return prices.length > 0 ? Math.min(...prices) : null;
  }

  private ensureFresh(): void {
    if (
      this.builtFor.prices === this.board.version &&
      this.builtFor.catalog === this.catalog.size
    ) {
      return;
    }

    this.rows = this.board.all().map((item) => {
      const metadata = this.catalog.get(item.name);

      return {
        name: item.name,
        searchName: item.name.toLowerCase(),
        image: metadata?.image ?? null,
        rarity: metadata?.rarity ?? null,
        rarityColor: metadata?.rarityColor ?? null,
        category: detectCategory(item.name, metadata?.type),
        whiteMarket: item.whiteMarket,
        dmarket: item.dmarket,
      };
    });
    this.byName = new Map(this.rows.map((row) => [row.name, row]));
    this.builtFor = { prices: this.board.version, catalog: this.catalog.size };
  }
}
