import { ApiProperty } from '@nestjs/swagger';

import { MarketId } from '../../../domain/market-links';

export enum SourceStatus {
  Ok = 'ok',
  NoKeys = 'noKeys',
  Error = 'error',
}

export class SourceStateDto {
  @ApiProperty({ enum: SourceStatus })
  status!: SourceStatus;

  @ApiProperty({ nullable: true })
  message!: string | null;
}

export class ListingStickerDto {
  name!: string;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Slot on the weapon from 0, when the market tells it',
  })
  slot!: number | null;

  @ApiProperty({
    nullable: true,
    description: 'How scraped the sticker is, 0 to 1; null when intact',
  })
  wear!: number | null;

  @ApiProperty({ nullable: true, description: 'Custom placement shift from the slot' })
  offsetX!: number | null;

  @ApiProperty({ nullable: true })
  offsetY!: number | null;

  @ApiProperty({ nullable: true, description: 'Degrees' })
  rotation!: number | null;

  @ApiProperty({ nullable: true })
  scale!: number | null;

  @ApiProperty({ nullable: true, description: 'Cheapest price of this sticker on its own, cents' })
  price!: number | null;

  @ApiProperty({ description: 'What it adds to the skin: nothing once scraped, cents' })
  value!: number;
}

export class ListingViewDto {
  @ApiProperty({ enum: MarketId })
  market!: MarketId;

  id!: string;
  name!: string;

  @ApiProperty({ nullable: true })
  image!: string | null;

  @ApiProperty({ description: 'Cents' })
  price!: number;

  @ApiProperty({ nullable: true })
  float!: string | null;

  @ApiProperty({ nullable: true })
  paintSeed!: number | null;

  @ApiProperty({ type: [ListingStickerDto] })
  stickers!: ListingStickerDto[];

  @ApiProperty({ description: 'What the intact applied stickers cost on their own, cents' })
  stickersValue!: number;

  @ApiProperty({ nullable: true, description: 'Cheapest listing of the same item, cents' })
  basePrice!: number | null;

  @ApiProperty({ nullable: true, description: 'Paid above the base price, cents' })
  overpay!: number | null;

  @ApiProperty({ description: 'Price of the searched stickers on this listing, cents' })
  wantedValue!: number;

  @ApiProperty({
    nullable: true,
    description: 'Overpay as a share of the searched stickers price, lower is better',
  })
  overpayShare!: number | null;

  url!: string;
}

export class ListingSourcesDto {
  @ApiProperty({ type: SourceStateDto })
  whiteMarket!: SourceStateDto;

  @ApiProperty({ type: SourceStateDto })
  dmarket!: SourceStateDto;

  @ApiProperty({ type: SourceStateDto })
  csfloat!: SourceStateDto;
}

export class ListingsDto {
  @ApiProperty({ type: ListingSourcesDto })
  sources!: ListingSourcesDto;

  @ApiProperty({ type: [ListingViewDto] })
  listings!: ListingViewDto[];
}
