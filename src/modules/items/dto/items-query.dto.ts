import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ItemCategory } from '../../../domain/categories';
import { MARKET_PHASES, type MarketPhase } from '../../../domain/market-variant';
import { MarketId } from '../../../domain/market-links';

export enum DealMode {
  All = 'all',
  Gap = 'gap',
  Flip = 'flip',
  Instant = 'instant',
  Top = 'top',
}

export enum ItemSort {
  Benefit = 'benefit',
  BenefitAmount = 'benefitAmount',
  BidCover = 'bidCover',
  Popular = 'popular',
  PriceAsc = 'priceAsc',
  PriceDesc = 'priceDesc',
  Name = 'name',
  Sales8w = 'sales8w',
  Score = 'score',
}

export enum ItemWear {
  FactoryNew = 'FN',
  MinimalWear = 'MW',
  FieldTested = 'FT',
  WellWorn = 'WW',
  BattleScarred = 'BS',
}

export enum ItemEdition {
  Normal = 'normal',
  StatTrak = 'stattrak',
  Souvenir = 'souvenir',
}

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export const DEFAULT_FEE_PERCENT = 5;
export const MAX_PAGE_SIZE = 100;

export class ItemsQueryDto {
  @ApiPropertyOptional({ description: 'Words from the item name, any order' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ItemCategory })
  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @ApiPropertyOptional({ enum: ItemWear })
  @IsOptional()
  @IsEnum(ItemWear)
  wear?: ItemWear;

  @ApiPropertyOptional({ enum: ItemEdition })
  @IsOptional()
  @IsEnum(ItemEdition)
  edition?: ItemEdition;

  @ApiPropertyOptional({ enum: MARKET_PHASES })
  @IsOptional()
  @IsIn(MARKET_PHASES)
  phase?: MarketPhase;

  @ApiPropertyOptional({ description: 'Exact collection name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  collection?: string;

  @ApiPropertyOptional({ enum: MarketId, description: 'Only items cheapest on this market' })
  @IsOptional()
  @IsEnum(MarketId)
  cheapestOn?: MarketId;

  @ApiPropertyOptional({ enum: DealMode, default: DealMode.All })
  @IsOptional()
  @IsEnum(DealMode)
  mode: DealMode = DealMode.All;

  @ApiPropertyOptional({ enum: ItemSort })
  @IsOptional()
  @IsEnum(ItemSort)
  sort?: ItemSort;

  @ApiPropertyOptional({ description: 'Lowest buy price, USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Highest buy price, USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Listings needed on each compared market', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  minListings = 0;

  @ApiPropertyOptional({ description: 'Sold on DMarket in the last 7 days, at least', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  minWeekSales = 0;

  @ApiPropertyOptional({ description: 'Sold on DMarket in the last 8 weeks, at least', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minEightWeekSales = 0;

  @ApiPropertyOptional({ description: 'Deal benefit or discount, at least, percent', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  minBenefitPercent = 0;

  @ApiPropertyOptional({
    description: 'Best buy order as % of the price, at least (top offers)',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(200)
  minBidCover = 0;

  @ApiPropertyOptional({ description: 'Hide deals that lose money after fees' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlyProfitable = false;

  @ApiPropertyOptional({ description: 'white.market seller fee, %', default: DEFAULT_FEE_PERCENT })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeWhiteMarket = DEFAULT_FEE_PERCENT;

  @ApiPropertyOptional({ description: 'DMarket seller fee, %', default: DEFAULT_FEE_PERCENT })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeDmarket = DEFAULT_FEE_PERCENT;

  @ApiPropertyOptional({ description: 'CSFloat seller fee, %', default: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeCsfloat = 2;

  @ApiPropertyOptional({ description: 'Exact item names, for favorites', type: [String] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value))
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  names?: string[];

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit = 30;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
