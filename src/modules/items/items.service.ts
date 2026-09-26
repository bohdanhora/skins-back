import { Injectable, NotFoundException } from '@nestjs/common';

import { ListingsService } from '../listings/listings.service';
import { type ListingsDto } from '../listings/dto/listings.dto';
import { PriceBoardService } from '../prices/price-board.service';
import { SalesHistoryService } from '../prices/sales-history.service';
import { type ItemViewDto, type ItemsPageDto, type SalesChartDto } from './dto/item-view.dto';
import { summarizeSales, type DailySales } from '../../domain/sales';
import { CsfloatClient } from '../csfloat/csfloat.client';
import { WhiteMarketStatsClient } from '../white-market/white-market-stats.client';
import { type ItemsQueryDto } from './dto/items-query.dto';
import { ItemIndexService } from './item-index.service';
import { feesFrom, queryItems, toView } from './item-query';
import { buildItemLibrary } from './item-library';
import {
  type ItemFacetsDto,
  type ItemLibraryDto,
  type ItemLibraryQueryDto,
} from './dto/item-library.dto';

const ITEM_LISTINGS = 10;
const MARKET_SALES_TTL_MS = 30 * 60_000;
const MARKET_SALES_CACHE_SIZE = 300;

@Injectable()
export class ItemsService {
  constructor(
    private readonly index: ItemIndexService,
    private readonly board: PriceBoardService,
    private readonly listings: ListingsService,
    private readonly sales: SalesHistoryService,
    private readonly csfloat: CsfloatClient,
    private readonly whiteMarketStats: WhiteMarketStatsClient,
  ) {}

  private readonly marketSales = new Map<string, { days: DailySales[]; at: number }>();

  list(query: ItemsQueryDto): ItemsPageDto {
    const page = queryItems(this.index.all(), query, (name) => this.sales.get(name));
    const stamps = Object.values(this.board.state)
      .map((state) => state.updatedAt)
      .filter((stamp): stamp is string => stamp !== null);

    return { ...page, updatedAt: stamps.sort()[0] ?? null };
  }

  async get(
    name: string,
    fees: Pick<ItemsQueryDto, 'feeWhiteMarket' | 'feeDmarket' | 'feeCsfloat'>,
  ): Promise<ItemViewDto> {
    await this.board.refreshItem(name).catch(() => undefined);

    const item = this.index.find(name);

    if (!item) {
      throw new NotFoundException('Item is not sold on any market right now');
    }

    return toView(item, feesFrom(fees), this.sales.get(name));
  }

  async salesChart(name: string): Promise<SalesChartDto> {
    const [days, csfloat, whiteMarket] = await Promise.all([
      this.sales.chart(name),
      this.csfloat.isEnabled
        ? this.cachedDays(`csfloat:${name}`, () => this.csfloat.fetchDailySales(name))
        : Promise.resolve(null),
      this.cachedDays(`whiteMarket:${name}`, () => this.whiteMarketStats.fetchDailySales(name)),
    ]);

    return { days, stats: summarizeSales(days), markets: { dmarket: days, csfloat, whiteMarket } };
  }

  private async cachedDays(
    key: string,
    load: () => Promise<DailySales[]>,
  ): Promise<DailySales[] | null> {
    const cached = this.marketSales.get(key);

    if (cached && Date.now() - cached.at < MARKET_SALES_TTL_MS) {
      return cached.days;
    }

    try {
      const days = await load();

      if (this.marketSales.size >= MARKET_SALES_CACHE_SIZE) {
        this.marketSales.delete(this.marketSales.keys().next().value!);
      }

      this.marketSales.set(key, { days, at: Date.now() });

      return days;
    } catch {
      return cached?.days ?? null;
    }
  }

  listingsFor(name: string): Promise<ListingsDto> {
    return this.listings.search({ name, limit: ITEM_LISTINGS });
  }

  facets(): ItemFacetsDto {
    return { collections: this.index.collections(), subcategories: this.index.subcategories() };
  }

  library(query: ItemLibraryQueryDto): ItemLibraryDto {
    return buildItemLibrary(this.index.all(), query);
  }
}
