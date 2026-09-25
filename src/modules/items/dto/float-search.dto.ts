import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { MarketId } from '../../../domain/market-links';
import { SourceStatus } from '../../listings/dto/listings.dto';

export class FloatSearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatFrom?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatTo?: number;
}

export class FloatListingDto {
  @ApiProperty({ enum: [...Object.values(MarketId), 'csfloat'] })
  market!: MarketId | 'csfloat';

  @ApiProperty({ description: 'Cents' })
  price!: number;

  @ApiProperty({ nullable: true })
  float!: number | null;

  @ApiProperty({ nullable: true })
  paintSeed!: number | null;

  url!: string;
}

export class FloatBuyOrderDto {
  @ApiProperty({ description: 'Cents' })
  price!: number;

  amount!: number;

  @ApiProperty({ nullable: true, description: 'DMarket float bucket, e.g. FT-2' })
  floatPart!: string | null;

  @ApiProperty({ nullable: true, type: [Number], description: 'Float range of the bucket' })
  range!: [number, number] | null;
}

export class FloatSourceDto {
  @ApiProperty({ enum: SourceStatus })
  status!: SourceStatus;

  @ApiProperty({ type: [FloatListingDto] })
  listings!: FloatListingDto[];

  @ApiProperty({ description: 'All listings in the range, before the page limit' })
  total!: number;
}

export class SteamListingDto {
  id!: string;
  priceLabel!: string;

  @ApiProperty({ nullable: true })
  float!: number | null;

  @ApiProperty({ nullable: true })
  paintSeed!: number | null;

  @ApiProperty({ nullable: true })
  phase!: string | null;

  url!: string;
}

export class SteamSourceDto {
  @ApiProperty({ enum: SourceStatus })
  status!: SourceStatus;

  @ApiProperty({ type: [SteamListingDto] })
  listings!: SteamListingDto[];

  total!: number;
}

export class FloatSearchDto {
  @ApiProperty({ type: FloatSourceDto })
  dmarket!: FloatSourceDto;

  @ApiProperty({ type: FloatSourceDto })
  whiteMarket!: FloatSourceDto;

  @ApiProperty({ type: FloatSourceDto })
  csfloat!: FloatSourceDto;

  @ApiProperty({ type: SteamSourceDto })
  steam!: SteamSourceDto;

  @ApiProperty({
    type: FloatListingDto,
    nullable: true,
    description: 'white.market cheapest listing with its float, known even without a key',
  })
  whiteMarketCheapest!: FloatListingDto | null;

  @ApiProperty({ type: [FloatBuyOrderDto], description: 'DMarket buy orders that fit the range' })
  orders!: FloatBuyOrderDto[];

  @ApiProperty({ nullable: true, description: 'Cheapest listing of this item at any float, cents' })
  cheapestAnyFloat!: number | null;
}
