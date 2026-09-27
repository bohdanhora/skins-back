import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class InspectGenQueryDto {
  @ApiProperty({ description: 'Market name, a Doppler phase may follow in square brackets' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Defaults to the lowest float of the wear' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  float?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  seed?: number;

  @ApiPropertyOptional({ type: [String], description: 'Sticker names in slot order' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  stickers?: string[];
}

export class InspectGenDto {
  name!: string;
  float!: number;
  seed!: number;

  @ApiProperty({ description: 'Paste into the CS2 console' })
  console!: string;

  @ApiProperty({ description: 'steam:// inspect link' })
  link!: string;

  @ApiProperty({ description: 'Chat command for community inspect servers' })
  server!: string;

  @ApiProperty({ description: 'Classic !gen command' })
  gen!: string;

  @ApiProperty({ description: 'Sticker names that were not found in the catalog' })
  missingStickers!: string[];
}
