import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { DEFAULT_FEE_PERCENT, MAX_PAGE_SIZE } from '../../items/dto/items-query.dto';

export enum SnipeSort {
  Profit = 'profit',
  Percent = 'percent',
  PriceAsc = 'priceAsc',
  Fresh = 'fresh',
}

export enum SnipeSourceFilter {
  All = 'all',
  Dmarket = 'dmarket',
  WhiteMarket = 'whiteMarket',
  Csfloat = 'csfloat',
}

export class SnipesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ItemCategory })
  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @ApiPropertyOptional({ enum: SnipeSourceFilter, default: SnipeSourceFilter.All })
  @IsOptional()
  @IsEnum(SnipeSourceFilter)
  source: SnipeSourceFilter = SnipeSourceFilter.All;

  @ApiPropertyOptional({ description: 'Listing price from, USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Listing price to, USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minFloat?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxFloat?: number;

  @ApiPropertyOptional({ enum: MARKET_PHASES })
  @IsOptional()
  @IsIn(MARKET_PHASES)
  phase?: MarketPhase;

  @ApiPropertyOptional({ description: 'Profit after the fee, at least, USD', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minProfit = 0;

  @ApiPropertyOptional({
    description: 'Only orders that pay extra for a float bucket, pattern or phase',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  specialOnly = false;

  @ApiPropertyOptional({ enum: SnipeSort, default: SnipeSort.Profit })
  @IsOptional()
  @IsEnum(SnipeSort)
  sort: SnipeSort = SnipeSort.Profit;

  @ApiPropertyOptional({ description: 'DMarket seller fee, %', default: DEFAULT_FEE_PERCENT })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeDmarket = DEFAULT_FEE_PERCENT;

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

export class SnipeViewDto {
  name!: string;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({ nullable: true })
  rarityColor!: string | null;

  @ApiProperty({ enum: ItemCategory })
  category!: ItemCategory;

  @ApiProperty({ enum: ['dmarket', 'whiteMarket', 'csfloat'] })
  source!: 'dmarket' | 'whiteMarket' | 'csfloat';

  @ApiProperty({ description: 'Cents' })
  listingPrice!: number;

  @ApiProperty({ nullable: true })
  float!: number | null;

  @ApiProperty({ nullable: true })
  paintSeed!: number | null;

  @ApiProperty({ nullable: true })
  phase!: string | null;

  @ApiProperty({ description: 'Cents' })
  orderPrice!: number;

  orderAmount!: number;

  @ApiProperty({ nullable: true, description: 'DMarket float bucket the order asks for' })
  orderFloatPart!: string | null;

  @ApiProperty({ nullable: true, type: [Number] })
  orderFloatRange!: [number, number] | null;

  @ApiProperty({ nullable: true })
  orderPaintSeed!: number | null;

  @ApiProperty({ nullable: true })
  orderPhase!: string | null;

  @ApiProperty({ description: 'After the DMarket seller fee, cents' })
  profit!: number;

  percent!: number;

  @ApiProperty({ description: 'When the order book was read' })
  checkedAt!: string;

  listingUrl!: string;
}

export class SnipesPageDto {
  @ApiProperty({ type: [SnipeViewDto] })
  items!: SnipeViewDto[];

  total!: number;

  @ApiProperty({ description: 'Skins already scanned in the current pass' })
  checked!: number;

  @ApiProperty({ description: 'Skins with a float and DMarket buy orders' })
  candidates!: number;
}
