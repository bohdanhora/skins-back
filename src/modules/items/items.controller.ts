import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { parseVariantName } from '../../domain/market-variant';
import { ListingsDto } from '../listings/dto/listings.dto';
import { SteamMarketClient, type SteamPrice } from '../steam/steam-market.client';
import { ItemViewDto, ItemsPageDto, SalesChartDto } from './dto/item-view.dto';
import { ItemsQueryDto } from './dto/items-query.dto';
import {
  ItemLibraryQueryDto,
  type ItemFacetsDto,
  type ItemLibraryDto,
} from './dto/item-library.dto';
import {
  BlueGemQueryDto,
  BlueGemSearchDto,
  BlueGemWeaponsDto,
  CheapestPatternsDto,
} from './dto/blue-gem.dto';
import { FloatSearchDto, FloatSearchQueryDto } from './dto/float-search.dto';
import { BlueGemService } from './blue-gem.service';
import { PatternImagesDto } from './dto/pattern-images.dto';
import { PatternImagesService } from './pattern-images.service';
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
    private readonly blueGems: BlueGemService,
    private readonly patterns: PatternImagesService,
    private readonly steamMarket: SteamMarketClient,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search and compare items, or find the best deals' })
  @ApiOkResponse({ type: ItemsPageDto })
  list(@Query() query: ItemsQueryDto): ItemsPageDto {
    return this.items.list(query);
  }

  @Get('facets')
  facets(): ItemFacetsDto {
    return this.items.facets();
  }

  @Get('library')
  library(@Query() query: ItemLibraryQueryDto): ItemLibraryDto {
    return this.items.library(query);
  }

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

  @Get('steam')
  @ApiOperation({
    summary: 'Steam Market lowest and median price in USD, without the Doppler phase',
  })
  @ApiQuery({ name: 'name', required: true })
  steam(@Query() query: ItemNameQueryDto): Promise<SteamPrice> {
    return this.steamMarket.priceOverview(parseVariantName(query.name).marketHashName);
  }

  @Get('patterns')
  @ApiOperation({ summary: 'pattern.wiki preview image for every seed of a skin' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: PatternImagesDto })
  patternImages(@Query() query: ItemNameQueryDto): Promise<PatternImagesDto> {
    return this.patterns.images(query.name);
  }

  @Get('blue-gems/cheapest')
  @ApiOperation({ summary: 'Pattern and blue share of the cheapest Case Hardened listings' })
  @ApiQuery({ name: 'name', required: true })
  @ApiOkResponse({ type: CheapestPatternsDto })
  cheapestPatterns(@Query() query: ItemNameQueryDto): Promise<CheapestPatternsDto> {
    return this.blueGems.cheapest(query.name);
  }

  @Get('blue-gems/weapons')
  @ApiOperation({ summary: 'Case Hardened items with known blue shares' })
  @ApiOkResponse({ type: BlueGemWeaponsDto })
  blueGemWeapons(): BlueGemWeaponsDto {
    return { weapons: this.blueGems.weapons() };
  }

  @Get('blue-gems')
  @ApiOperation({ summary: 'Case Hardened listings on every market, bluest pattern first' })
  @ApiOkResponse({ type: BlueGemSearchDto })
  blueGemSearch(@Query() query: BlueGemQueryDto): Promise<BlueGemSearchDto> {
    return this.blueGems.search(query);
  }

  @Get('floats')
  @ApiOperation({ summary: 'Listings inside a float range on all markets, plus buy orders' })
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
