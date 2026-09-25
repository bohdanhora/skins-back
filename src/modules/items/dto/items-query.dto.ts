import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ItemCategory } from '../../../domain/categories';

export enum DealMode {
  /** Any item, no comparison required. */
  All = 'all',
  /** Items sold on both markets: where it is cheaper and by how much. */
  Gap = 'gap',
  /** Buy on the cheaper market, list on the other one. */
  Flip = 'flip',
  /** Buy on white.market, sell into a DMarket buy order at once. */
  Instant = 'instant',
  /** Cheaper right now than it has been selling for lately. */
  Top = 'top',
}

export enum ItemSort {
  Benefit = 'benefit',
  BenefitAmount = 'benefitAmount',
  /** Buy orders closest to the price first: the safest buys. */
  BidCover = 'bidCover',
  Popular = 'popular',
  PriceAsc = 'priceAsc',
  PriceDesc = 'priceDesc',
  Name = 'name',
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
