import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MARKET_PHASES, type MarketPhase } from '../../../domain/market-variant';
import { SELL_MARKETS, type SellMarketId } from '../../../domain/market-links';
import { BlueShareDto } from '../../items/dto/blue-gem.dto';
import { DEFAULT_FEE_PERCENT } from '../../items/dto/items-query.dto';
import { MarketQuoteDto, SalesStatsDto } from '../../items/dto/item-view.dto';

export const DEFAULT_WITHDRAWALS = { whiteMarket: 0, dmarket: 2, csfloat: 2.5 };

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class InventoryQueryDto {
  @ApiProperty({ description: 'Steam profile link, SteamID64 or custom URL name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  profile!: string;

  @ApiPropertyOptional({ description: 'Skip the cached inventory' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  refresh = false;

  @ApiPropertyOptional({ description: 'white.market seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeWhiteMarket = DEFAULT_FEE_PERCENT;

  @ApiPropertyOptional({ description: 'DMarket seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeDmarket = DEFAULT_FEE_PERCENT;

  @ApiPropertyOptional({ description: 'CSFloat seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeCsfloat = 2;

  @ApiPropertyOptional({ description: 'white.market withdrawal fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  withdrawWhiteMarket = DEFAULT_WITHDRAWALS.whiteMarket;

  @ApiPropertyOptional({ description: 'DMarket withdrawal fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  withdrawDmarket = DEFAULT_WITHDRAWALS.dmarket;

  @ApiPropertyOptional({ description: 'CSFloat withdrawal fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  withdrawCsfloat = DEFAULT_WITHDRAWALS.csfloat;
}

export class SaleOptionDto {
  @ApiProperty({ enum: SELL_MARKETS })
  market!: SellMarketId;

  @ApiProperty({ enum: ['listing', 'instant'] })
  kind!: 'listing' | 'instant';

  @ApiProperty({
    description: 'Listing price one cent under the cheapest, or the best buy order, cents',
  })
  price!: number;

  @ApiProperty({ description: 'After the seller fee, cents' })
  afterFee!: number;

  @ApiProperty({ description: 'After the seller and withdrawal fees, cents' })
  payout!: number;
}

export class InventoryItemDto {
  assetIds!: string[];
  name!: string;
  marketHashName!: string;
  type!: string;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({ nullable: true })
  rarityColor!: string | null;

  @ApiProperty({ nullable: true })
  float!: number | null;

  @ApiProperty({ nullable: true })
  paintSeed!: number | null;

  @ApiProperty({ type: BlueShareDto, nullable: true })
  blue!: BlueShareDto | null;

  @ApiProperty({ enum: MARKET_PHASES, nullable: true })
  phase!: MarketPhase | null;

  amount!: number;
  tradable!: boolean;
  marketable!: boolean;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  whiteMarket!: MarketQuoteDto | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  dmarket!: MarketQuoteDto | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  csfloat!: MarketQuoteDto | null;

  @ApiProperty({ type: [SaleOptionDto] })
  options!: SaleOptionDto[];

  @ApiProperty({ type: SaleOptionDto, nullable: true })
  best!: SaleOptionDto | null;

  @ApiProperty({ nullable: true, description: 'Cheapest listing across markets, cents' })
  marketPrice!: number | null;

  @ApiProperty({ type: SalesStatsDto, nullable: true })
  sales!: SalesStatsDto | null;
}

export class MarketTotalsDto {
  whiteMarket!: number;
  dmarket!: number;
  csfloat!: number;
}

export class InventoryTotalsDto {
  @ApiProperty({ description: 'Cheapest listings summed, cents' })
  marketPrice!: number;

  @ApiProperty({ description: 'Each item sold where it pays out most, cents' })
  best!: number;

  @ApiProperty({
    type: MarketTotalsDto,
    description: 'Payout if everything is listed there, cents',
  })
  listing!: MarketTotalsDto;

  @ApiProperty({ type: MarketTotalsDto, description: 'Items that market can price' })
  listingItems!: MarketTotalsDto;

  @ApiProperty({ description: 'Payout from DMarket buy orders, cents' })
  instant!: number;

  instantItems!: number;
  items!: number;
  pricedItems!: number;
  unsellableItems!: number;
}

export class InventoryDto {
  steamId!: string;

  @ApiProperty({ nullable: true })
  name!: string | null;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  fetchedAt!: string;

  @ApiProperty({ type: InventoryTotalsDto })
  totals!: InventoryTotalsDto;

  @ApiProperty({ type: [InventoryItemDto] })
  items!: InventoryItemDto[];
}
