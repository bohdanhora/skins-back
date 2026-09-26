import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ItemCategory } from '../../../domain/categories';
import { MARKET_PHASES, type MarketPhase } from '../../../domain/market-variant';
import { MarketId } from '../../../domain/market-links';

export class MarketQuoteDto {
  @ApiProperty({ nullable: true, description: 'Lowest listing, cents' })
  price!: number | null;

  listings!: number;

  @ApiProperty({ nullable: true, description: 'Best buy order, cents' })
  bid!: number | null;

  bids!: number;
  url!: string;
}

export class PriceGapDto {
  @ApiProperty({ enum: MarketId })
  cheaper!: MarketId;

  @ApiProperty({ description: 'Cents' })
  amount!: number;

  percent!: number;
}

export class FlipDto {
  @ApiProperty({ enum: MarketId })
  buyOn!: MarketId;

  @ApiProperty({ enum: MarketId })
  sellOn!: MarketId;

  buyPrice!: number;
  sellPrice!: number;
  profit!: number;
  percent!: number;
}

export class SalesStatsDto {
  @ApiProperty({ description: 'Low end of recent DMarket sales, cents' })
  floor!: number;

  @ApiProperty({ description: 'Last day with sales, YYYY-MM-DD' })
  lastDay!: string;

  @ApiProperty({ description: 'Average sale price that day, cents' })
  lastAverage!: number;

  @ApiProperty({ description: 'Sold on DMarket in the last 7 days' })
  weekSales!: number;
  @ApiPropertyOptional()
  eightWeekSales?: number;

  @ApiPropertyOptional()
  eightWeekAverage?: number;

  @ApiProperty({ nullable: true })
  trendPercent?: number | null;
}

export class TopOfferDto {
  @ApiProperty({ description: 'Cheapest listing across all markets, cents' })
  price!: number;

  @ApiProperty({
    description: 'Sales floor or the other market listing, whichever is lower, cents',
  })
  reference!: number;

  @ApiProperty({ description: 'Below the reference, cents' })
  discount!: number;

  percent!: number;

  @ApiProperty({ nullable: true, description: 'Best DMarket buy order as % of the price' })
  bidCover!: number | null;
}

export class ItemViewDto {
  name!: string;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({ nullable: true })
  rarity!: string | null;

  @ApiProperty({ nullable: true })
  rarityColor!: string | null;

  @ApiProperty({ enum: ItemCategory })
  category!: ItemCategory;

  @ApiPropertyOptional({ enum: MARKET_PHASES, nullable: true })
  phase!: MarketPhase | null;

  collections!: { name: string; image: string | null }[];

  dealScore!: { score: number; confidence: 'high' | 'medium' | 'low' } | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  whiteMarket!: MarketQuoteDto | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  dmarket!: MarketQuoteDto | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  csfloat!: MarketQuoteDto | null;

  @ApiProperty({ type: MarketQuoteDto, nullable: true })
  lisSkins!: MarketQuoteDto | null;

  @ApiProperty({ type: PriceGapDto, nullable: true })
  gap!: PriceGapDto | null;

  @ApiProperty({ type: FlipDto, nullable: true })
  flip!: FlipDto | null;

  @ApiProperty({ type: FlipDto, nullable: true })
  instant!: FlipDto | null;

  @ApiProperty({ type: SalesStatsDto, nullable: true })
  sales!: SalesStatsDto | null;

  @ApiProperty({ type: TopOfferDto, nullable: true })
  top!: TopOfferDto | null;
}

export class SalesDayDto {
  day!: string;

  @ApiProperty({ description: 'Average sale price, cents' })
  average!: number;

  count!: number;
}

export class MarketSalesDto {
  @ApiProperty({ type: [SalesDayDto] })
  dmarket!: SalesDayDto[];

  @ApiProperty({ type: [SalesDayDto], nullable: true, description: 'Null without a CSFloat key' })
  csfloat!: SalesDayDto[] | null;

  @ApiProperty({ type: [SalesDayDto], nullable: true })
  whiteMarket!: SalesDayDto[] | null;
}

export class SalesChartDto {
  @ApiProperty({ type: [SalesDayDto], description: 'DMarket days' })
  days!: SalesDayDto[];

  @ApiProperty({ type: MarketSalesDto })
  markets!: MarketSalesDto;

  @ApiProperty({ type: SalesStatsDto, nullable: true })
  stats!: SalesStatsDto | null;
}

export class SalesProgressDto {
  checked!: number;
  total!: number;
}

export class ItemsPageDto {
  @ApiProperty({ type: [ItemViewDto] })
  items!: ItemViewDto[];

  total!: number;

  @ApiPropertyOptional({ nullable: true })
  updatedAt!: string | null;
}
