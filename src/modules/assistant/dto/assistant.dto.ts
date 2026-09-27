import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ASSISTANT_PROVIDERS } from '../../../domain/assistant-providers';

const PROVIDER_IDS = ASSISTANT_PROVIDERS.map((provider) => provider.id);
const MAX_IMAGE_LENGTH = 7_000_000;

export class AssistantProviderDto {
  id!: string;
  label!: string;
  apiKeysUrl!: string;
  keyHint!: string;
  defaultModel!: string;
  models!: string[];

  @ApiProperty({ description: 'Can look things up on the web' })
  webSearch!: boolean;
}

export class AssistantSettingsDto {
  @ApiProperty({ type: String, nullable: true })
  provider!: string | null;

  @ApiProperty({ type: String, nullable: true })
  model!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Masked key, never the key itself' })
  keyHint!: string | null;

  @ApiProperty({ description: 'The server can store keys' })
  available!: boolean;
}

export class AssistantSettingsInputDto {
  @ApiProperty({ enum: PROVIDER_IDS })
  @IsIn(PROVIDER_IDS)
  provider!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  model!: string;

  @ApiPropertyOptional({ description: 'Omit to keep the key already saved for this provider' })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;
}

export class AssistantModelsQueryDto {
  @ApiProperty({ enum: PROVIDER_IDS })
  @IsIn(PROVIDER_IDS)
  provider!: string;
}

export class SourceDto {
  url!: string;
  title!: string;
}

export class MatchBriefDto {
  @ApiProperty({ enum: ['confirm', 'caution', 'avoid', 'no_bet'] })
  verdict!: 'confirm' | 'caution' | 'avoid' | 'no_bet';

  summary!: string;
  warnings!: string[];

  @ApiProperty({ description: 'Whether the best bet looks trustworthy' })
  betCheck!: { status: 'ok' | 'check'; reason: string };

  lineups!: { team1: string[]; team2: string[] };

  @ApiProperty({ type: [SourceDto] })
  sources!: SourceDto[];

  @ApiProperty({ description: 'The model looked things up on the web' })
  searched!: boolean;

  model!: string;
  createdAt!: string;
}

export class PurchaseDraftInputDto {
  @ApiPropertyOptional({ description: 'Screenshot as a data URL' })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpeg|gif|webp);base64,/)
  @MaxLength(MAX_IMAGE_LENGTH)
  image?: string;

  @ApiPropertyOptional({ description: 'Listing link' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(600)
  url?: string;

  @ApiPropertyOptional({ description: 'Any text describing the purchase' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}

export class PurchaseDraftDto {
  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ description: 'Whether the name matches a known item' })
  known!: boolean;

  @ApiProperty({ type: String, nullable: true })
  image!: string | null;

  @ApiProperty({ type: String, nullable: true })
  rarityColor!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Cents' })
  price!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  float!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  paintSeed!: number | null;

  stickers!: string[];

  @ApiProperty({ type: String, nullable: true })
  market!: string | null;
}

export class SmartSearchInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  query!: string;
}

export class SmartSearchDto {
  @ApiPropertyOptional()
  q?: string;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  wear?: string;

  @ApiPropertyOptional()
  edition?: string;

  @ApiPropertyOptional()
  phase?: string;

  @ApiPropertyOptional({ description: 'Dollars' })
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Dollars' })
  maxPrice?: number;

  @ApiPropertyOptional()
  sort?: string;

  @ApiPropertyOptional({ description: 'What the filters could not express' })
  note?: string;

  @ApiPropertyOptional({
    description: 'Items the model picked from real listings, each with a short reason',
  })
  picks?: { name: string; reason: string; price: number | null }[];
}

export class BluePicksInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  weapon!: string;

  @ApiPropertyOptional({ enum: ['FN', 'MW', 'FT', 'WW', 'BS'] })
  @IsOptional()
  @IsIn(['FN', 'MW', 'FT', 'WW', 'BS'])
  wear?: 'FN' | 'MW' | 'FT' | 'WW' | 'BS';
}

export class BluePickDto {
  market!: string;
  id!: string;
  name!: string;

  @ApiProperty({ description: 'Cents' })
  price!: number;

  @ApiProperty({ type: Number, nullable: true })
  float!: number | null;

  paintSeed!: number;
  blue!: { playside: number; backside: number };
  url!: string;

  @ApiProperty({ description: 'What similar blue sold for, cents' })
  estimate!: number;

  @ApiProperty({ description: 'Estimate minus price, cents' })
  margin!: number;

  multiplier!: number;
  comparableCount!: number;

  @ApiProperty({ enum: ['csfloat', 'calculator'] })
  source!: 'csfloat' | 'calculator';

  @ApiProperty({ description: 'Explanation from the model, empty without an assistant' })
  reason!: string;
}

export class BluePicksDto {
  @ApiProperty({ type: [BluePickDto] })
  picks!: BluePickDto[];

  @ApiProperty({ type: String, nullable: true })
  summary!: string | null;

  checked!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'CSFloat sales were unavailable until then',
  })
  csfloatPausedUntil!: string | null;
}

export class FloatPicksInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatFrom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  floatTo?: number;

  @ApiPropertyOptional({ description: 'DMarket seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeDmarket?: number;
}

export class FloatPickDto {
  market!: string;

  @ApiProperty({ description: 'Cents' })
  price!: number;

  float!: number;

  @ApiProperty({ type: Number, nullable: true })
  paintSeed!: number | null;

  url!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Cheapest listing with a worse float',
  })
  worseCheapest!: number | null;

  @ApiProperty({ description: 'How much cheaper than those worse floats, cents' })
  saving!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Best DMarket buy order covering this float',
  })
  orderPrice!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Profit from selling into that order' })
  orderProfit!: number | null;

  reason!: string;
}

export class FloatPicksDto {
  @ApiProperty({ type: [FloatPickDto] })
  picks!: FloatPickDto[];

  @ApiProperty({ type: String, nullable: true })
  summary!: string | null;

  checked!: number;

  @ApiProperty({ type: String, nullable: true })
  csfloatPausedUntil!: string | null;
}

export class ItemAnalysisInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'white.market seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeWhiteMarket?: number;

  @ApiPropertyOptional({ description: 'DMarket seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeDmarket?: number;

  @ApiPropertyOptional({ description: 'CSFloat seller fee, %' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  feeCsfloat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn([true, false, 'true', 'false'])
  refresh?: boolean | string;
}

export class AnalyzedLotDto {
  market!: string;
  price!: number;

  @ApiProperty({ type: Number, nullable: true })
  float!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  paintSeed!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Fade percentage of the pattern' })
  fade!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Blue share of the playside, %' })
  blue!: number | null;

  url!: string;
}

export class SimilarSalesDto {
  count!: number;
  median!: number;
  low!: number;
  high!: number;

  @ApiProperty({ type: [Number] })
  floatRange!: [number, number];
}

export class ItemAnalysisDto {
  @ApiProperty({ description: 'Chance the purchase pays off, 1-100' })
  score!: number;

  @ApiProperty({ enum: ['buy', 'consider', 'skip'] })
  verdict!: 'buy' | 'consider' | 'skip';

  summary!: string;

  @ApiProperty({ type: [String] })
  pros!: string[];

  @ApiProperty({ type: [String] })
  cons!: string[];

  @ApiProperty({ type: AnalyzedLotDto, nullable: true })
  lot!: AnalyzedLotDto | null;

  @ApiProperty({ type: SimilarSalesDto, nullable: true })
  similarSales!: SimilarSalesDto | null;

  analyzedAt!: string;
}
