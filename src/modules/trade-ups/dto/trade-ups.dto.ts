import { ApiProperty } from '@nestjs/swagger';

import { TradeUpTier } from '../../../domain/trade-up';

export class TradeUpSkinDto {
  name!: string;
  weapon!: string;

  @ApiProperty({ enum: TradeUpTier })
  tier!: TradeUpTier;

  @ApiProperty({ type: [String] })
  collections!: string[];

  @ApiProperty({ type: [String], description: 'Cases that hold knives or gloves' })
  cases!: string[];

  minFloat!: number;
  maxFloat!: number;
  wearless!: boolean;
  stattrak!: boolean;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({
    description:
      'Cheapest listing on any market per wear, cents, with the listing count. Keys: FN..BS, ANY for items without wear, ST: prefix for StatTrak',
    additionalProperties: { type: 'array', items: { type: 'number' } },
  })
  prices!: Record<string, [number, number]>;
}

export class TradeUpCatalogDto {
  @ApiProperty({ type: [TradeUpSkinDto] })
  skins!: TradeUpSkinDto[];

  @ApiProperty({ nullable: true })
  updatedAt!: string | null;
}
