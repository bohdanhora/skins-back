import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { CASE_HARDENED_WEAPONS } from '../../../domain/blue-gem';
import { MarketId } from '../../../domain/market-links';
import { SourceStatus } from '../../listings/dto/listings.dto';

export const BLUE_GEM_WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'] as const;

export type BlueGemWear = (typeof BLUE_GEM_WEARS)[number];

export class BlueShareDto {
  @ApiProperty({ description: 'Blue share of the play side, or the top of an AK-47, percent' })
  playside!: number;

  @ApiProperty({ description: 'Blue share of the back side, or the magazine of an AK-47, percent' })
  backside!: number;
}

export class BlueGemQueryDto {
  @ApiProperty({ enum: CASE_HARDENED_WEAPONS })
  @IsString()
  @IsIn(CASE_HARDENED_WEAPONS)
  weapon!: string;

  @ApiPropertyOptional({ enum: BLUE_GEM_WEARS })
  @IsOptional()
  @IsIn(BLUE_GEM_WEARS)
  wear?: BlueGemWear;
}

export class BlueGemListingDto {
  @ApiProperty({ enum: [...Object.values(MarketId), 'steam'] })
  market!: MarketId | 'steam';

  id!: string;
  name!: string;

  @ApiProperty({ nullable: true, description: 'Cents' })
  price!: number | null;

  @ApiProperty({ nullable: true, description: 'Steam price as shown on Steam' })
  priceLabel!: string | null;

  @ApiProperty({ nullable: true })
  float!: number | null;

  paintSeed!: number;

  @ApiProperty({ type: BlueShareDto })
  blue!: BlueShareDto;

  @ApiProperty({
    nullable: true,
    description: 'Cheapest listing of the same wear and quality on any market, cents',
  })
  floorPrice!: number | null;

  url!: string;
}

export class CheapestPatternDto {
  @ApiProperty({ enum: [MarketId.WhiteMarket, MarketId.Dmarket] })
  market!: MarketId;

  @ApiProperty({ description: 'Cents' })
  price!: number;

  @ApiProperty({ nullable: true })
  float!: number | null;

  paintSeed!: number;

  @ApiProperty({ type: BlueShareDto })
  blue!: BlueShareDto;
}

export class CheapestPatternsDto {
  @ApiProperty({ type: [CheapestPatternDto] })
  listings!: CheapestPatternDto[];
}

export class BlueGemSourcesDto {
  @ApiProperty({ enum: SourceStatus })
  dmarket!: SourceStatus;

  @ApiProperty({ enum: SourceStatus })
  whiteMarket!: SourceStatus;

  @ApiProperty({ enum: SourceStatus })
  csfloat!: SourceStatus;

  @ApiProperty({ enum: SourceStatus, nullable: true, description: 'Checked only for one wear' })
  steam!: SourceStatus | null;
}

export class BlueGemSeedDto {
  seed!: number;

  @ApiProperty({ type: BlueShareDto })
  blue!: BlueShareDto;
}

export class BlueGemSearchDto {
  weapon!: string;

  @ApiProperty({ type: [BlueGemListingDto], description: 'Bluest first' })
  listings!: BlueGemListingDto[];

  @ApiProperty({ type: BlueGemSourcesDto })
  sources!: BlueGemSourcesDto;

  @ApiProperty({ type: [BlueGemSeedDto], description: 'Bluest patterns looked up on CSFloat' })
  csfloatSeeds!: BlueGemSeedDto[];

  checkedAt!: string;
}

export class BlueGemWeaponsDto {
  @ApiProperty({ type: [String] })
  weapons!: string[];
}
