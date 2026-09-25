import { Injectable, NotFoundException } from '@nestjs/common';

import { ListingsService } from '../listings/listings.service';
import { type ListingsDto } from '../listings/dto/listings.dto';
import { PriceBoardService } from '../prices/price-board.service';
import { SalesHistoryService } from '../prices/sales-history.service';
import { type ItemViewDto, type ItemsPageDto, type SalesChartDto } from './dto/item-view.dto';
import { summarizeSales } from '../../domain/sales';
import { type ItemsQueryDto } from './dto/items-query.dto';
import { ItemIndexService } from './item-index.service';
import { feesFrom, queryItems, toView } from './item-query';

const ITEM_LISTINGS = 10;

@Injectable()
export class ItemsService {
  constructor(
    private readonly index: ItemIndexService,
    private readonly board: PriceBoardService,
    private readonly listings: ListingsService,
    private readonly sales: SalesHistoryService,
  ) {}

  list(query: ItemsQueryDto): ItemsPageDto {
    const page = queryItems(this.index.all(), query, (name) => this.sales.get(name));
    const { whiteMarket, dmarket, csfloat } = this.board.state;
    const stamps = [whiteMarket.updatedAt, dmarket.updatedAt, csfloat.updatedAt].filter(
      (stamp): stamp is string => stamp !== null,
    );

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
    const days = await this.sales.chart(name);

    return { days, stats: summarizeSales(days) };
  }

  listingsFor(name: string): Promise<ListingsDto> {
    return this.listings.search({ name, limit: ITEM_LISTINGS });
  }

  facets(): { collections: { name: string; image: string | null }[] } {
    return { collections: this.index.collections() };
  }
}
