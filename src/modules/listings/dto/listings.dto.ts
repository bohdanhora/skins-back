import { ApiProperty } from '@nestjs/swagger';

import { MarketId } from '../../../domain/market-links';

export enum SourceStatus {
  Ok = 'ok',
  /** The optional API key for this market is not set. */
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

  @ApiProperty({ nullable: true, description: 'Cheapest price of this sticker on its own, cents' })
  price!: number | null;
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

  @ApiProperty({ type: [ListingStickerDto] })
  stickers!: ListingStickerDto[];

  @ApiProperty({ description: 'What the applied stickers cost on their own, cents' })
  stickersValue!: number;

  url!: string;
}

export class ListingSourcesDto {
  @ApiProperty({ type: SourceStateDto })
  whiteMarket!: SourceStateDto;

  @ApiProperty({ type: SourceStateDto })
  dmarket!: SourceStateDto;
}

export class ListingsDto {
  @ApiProperty({ type: ListingSourcesDto })
  sources!: ListingSourcesDto;

  @ApiProperty({ type: [ListingViewDto] })
  listings!: ListingViewDto[];
}
