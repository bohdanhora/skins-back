import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DMARKET_FLOAT_PARTS } from '../../domain/float';
import { snipeProfit } from '../../domain/float-snipes';
import { dmarketItemUrl, dmarketListingUrl } from '../../domain/market-links';
import { ItemIndexService } from '../items/item-index.service';
import { PriceBoardService } from '../prices/price-board.service';
import {
  SnipeSort,
  SnipeSourceFilter,
  SnipeViewDto,
  SnipesPageDto,
  SnipesQueryDto,
} from './dto/snipes.dto';
import { FloatSnipeScannerService } from './float-snipe-scanner.service';

const PERCENT = 100;

const floatRange = (floatPart: string | null): [number, number] | null => {
  const range = floatPart ? DMARKET_FLOAT_PARTS[floatPart] : undefined;

  return range ? [range[0], range[1]] : null;
};

@ApiTags('snipes')
@Controller('snipes')
export class SnipesController {
  constructor(
    private readonly scanner: FloatSnipeScannerService,
    private readonly index: ItemIndexService,
    private readonly board: PriceBoardService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listings whose float, pattern or phase fits a buy order paying more than the price',
  })
  @ApiOkResponse({ type: SnipesPageDto })
  list(@Query() query: SnipesQueryDto): SnipesPageDto {
    const fee = query.feeDmarket / PERCENT;
    const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const minPrice = query.minPrice !== undefined ? Math.round(query.minPrice * 100) : null;
    const maxPrice = query.maxPrice !== undefined ? Math.round(query.maxPrice * 100) : null;
    const minProfit = Math.round(query.minProfit * 100);
    const rows: SnipeViewDto[] = [];

    for (const [name, result] of this.scanner.all()) {
      const item = this.index.find(name);

      if (!item || (query.category && item.category !== query.category)) {
        continue;
      }

      if (!words.every((word) => item.searchName.includes(word))) {
        continue;
      }

      for (const snipe of result.snipes) {
        const profit = snipeProfit(snipe, fee);

        if (
          profit <= 0 ||
          profit < minProfit ||
          (query.specialOnly &&
            !snipe.orderFloatPart &&
            snipe.orderPaintSeed === null &&
            !snipe.orderPhase) ||
          (query.source !== SnipeSourceFilter.All && snipe.source !== (query.source as string)) ||
          (minPrice !== null && snipe.listingPrice < minPrice) ||
          (maxPrice !== null && snipe.listingPrice > maxPrice)
        ) {
          continue;
        }

        rows.push({
          name,
          image: item.image,
          rarityColor: item.rarityColor,
          category: item.category,
          ...snipe,
          orderFloatRange: floatRange(snipe.orderFloatPart),
          profit,
          percent: Math.round((profit / snipe.listingPrice) * 10_000) / 100,
          checkedAt: new Date(result.checkedAt).toISOString(),
          listingUrl:
            snipe.source === 'whiteMarket'
              ? (this.board.whiteMarketPrice(name)?.url ?? dmarketItemUrl(name))
              : dmarketListingUrl(name, snipe.float),
        });
      }
    }

    rows.sort(comparators[query.sort]);

    const progress = this.scanner.progress();

    return {
      items: rows.slice(query.offset, query.offset + query.limit),
      total: rows.length,
      checked: progress.checked,
      candidates: progress.total,
    };
  }
}

const comparators: Record<SnipeSort, (left: SnipeViewDto, right: SnipeViewDto) => number> = {
  [SnipeSort.Profit]: (left, right) => right.profit - left.profit,
  [SnipeSort.Percent]: (left, right) => right.percent - left.percent,
  [SnipeSort.PriceAsc]: (left, right) => left.listingPrice - right.listingPrice,
  [SnipeSort.Fresh]: (left, right) => right.checkedAt.localeCompare(left.checkedAt),
};
