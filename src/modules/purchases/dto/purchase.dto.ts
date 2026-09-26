import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PURCHASE_MARKETS = [
  'whiteMarket',
  'dmarket',
  'csfloat',
  'lisSkins',
  'steam',
  'other',
] as const;

export type PurchaseMarket = (typeof PURCHASE_MARKETS)[number];

const MAX_CENTS = 1_000_000_000;
const MAX_IMPORT = 2000;

export class PurchaseSaleDto {
  @ApiProperty({ enum: PURCHASE_MARKETS })
  @IsIn(PURCHASE_MARKETS)
  market!: PurchaseMarket;

  @ApiProperty({ description: 'Money received after every fee, cents' })
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  received!: number;

  @ApiProperty()
  @IsDateString()
  soldAt!: string;
}

export class PurchaseInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  image: string | null = null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  rarityColor: string | null = null;

  @ApiProperty({ description: 'Price paid for one item, cents' })
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  price!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(100_000)
  amount = 1;

  @ApiProperty({ enum: PURCHASE_MARKETS })
  @IsIn(PURCHASE_MARKETS)
  market!: PurchaseMarket;

  @ApiProperty()
  @IsDateString()
  boughtAt!: string;

  @ApiProperty()
  @IsDateString()
  unlockAt!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  float: number | null = null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  paintSeed: number | null = null;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  note = '';

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  assetId: string | null = null;

  @ApiPropertyOptional({ type: PurchaseSaleDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PurchaseSaleDto)
  sale: PurchaseSaleDto | null = null;
}

export class PurchaseDto extends PurchaseInputDto {
  @ApiProperty()
  id!: string;
}

export class PurchaseImportDto {
  @ApiProperty({ type: [PurchaseInputDto] })
  @IsArray()
  @ArrayMaxSize(MAX_IMPORT)
  @ValidateNested({ each: true })
  @Type(() => PurchaseInputDto)
  purchases!: PurchaseInputDto[];
}
