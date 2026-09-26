import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

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
}
