import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ListingsDto } from '../listings/dto/listings.dto';
import { ItemViewDto, ItemsPageDto, SalesChartDto } from './dto/item-view.dto';
import { ItemsQueryDto } from './dto/items-query.dto';
import { FloatSearchDto, FloatSearchQueryDto } from './dto/float-search.dto';
import { FloatSearchService } from './float-search.service';
import { ItemsService } from './items.service';

class ItemNameQueryDto extends ItemsQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}

@ApiTags('items')
@Controller('items')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly floats: FloatSearchService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search and compare items, or find the best deals' })
  @ApiOkResponse({ type: ItemsPageDto })
  list(@Query() query: ItemsQueryDto): ItemsPageDto {
    return this.items.list(query);
  }

  // Item names contain `|`, `/` and `™`, so they travel as a query value, not a path segment.
  @Get('one')
  @ApiOperation({ summary: 'One item with DMarket prices re-read right now' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: ItemViewDto })
  one(@Query() query: ItemNameQueryDto): Promise<ItemViewDto> {
    return this.items.get(query.name, query);
  }

  @Get('sales')
  @ApiOperation({ summary: 'Daily DMarket sales for the last eight weeks' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: SalesChartDto })
  sales(@Query() query: ItemNameQueryDto): Promise<SalesChartDto> {
    return this.items.salesChart(query.name);
  }

  @Get('floats')
  @ApiOperation({ summary: 'Listings inside a float range on both markets, plus buy orders' })
  @ApiOkResponse({ type: FloatSearchDto })
  floatSearch(@Query() query: FloatSearchQueryDto): Promise<FloatSearchDto> {
    return this.floats.search(query);
  }

  @Get('listings')
  @ApiOperation({ summary: 'Cheapest individual listings with float and stickers' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: ListingsDto })
  listings(@Query() query: ItemNameQueryDto): Promise<ListingsDto> {
    return this.items.listingsFor(query.name);
  }
}
