import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

const MAX_FEE = 50;

export class MarketFeesDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(MAX_FEE)
  whiteMarket!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(MAX_FEE)
  dmarket!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(MAX_FEE)
  csfloat!: number;
}

export class SettingsDto {
  @ApiProperty({ type: MarketFeesDto, nullable: true, description: 'Seller fees, %' })
  fees!: MarketFeesDto | null;

  @ApiProperty({ type: MarketFeesDto, nullable: true, description: 'Withdrawal fees, %' })
  withdrawals!: MarketFeesDto | null;

  @ApiProperty({ type: String, nullable: true })
  steamProfile!: string | null;

  @ApiProperty({ enum: THEMES, nullable: true })
  theme!: Theme | null;
}

export class SettingsPatchDto {
  @ApiPropertyOptional({ type: MarketFeesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketFeesDto)
  fees?: MarketFeesDto;

  @ApiPropertyOptional({ type: MarketFeesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MarketFeesDto)
  withdrawals?: MarketFeesDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  steamProfile?: string;

  @ApiPropertyOptional({ enum: THEMES })
  @IsOptional()
  @IsIn(THEMES)
  theme?: Theme;
}
