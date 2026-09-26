import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

import { BlueShareDto } from './blue-gem.dto';

export class BlueValueQueryDto {
  @ApiProperty({ description: 'Exact Case Hardened item name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  paintSeed!: number;
}

export class BlueSaleDto {
  name!: string;

  @ApiProperty({ description: 'Cents' })
  price!: number;

  @ApiProperty({ description: 'Price against a plain pattern of the same float, 1 is no premium' })
  ratio!: number;

  paintSeed!: number;
  float!: number;
  blue!: BlueShareDto;
  soldAt!: string;
}

export class BlueValueDto {
  @ApiProperty({ type: BlueShareDto })
  blue!: BlueShareDto;

  @ApiProperty({
    enum: ['csfloat', 'calculator'],
    description: 'csfloat when the share comes from CSFloat, which buyers see',
  })
  source!: 'csfloat' | 'calculator';

  @ApiProperty({ nullable: true, description: 'Cheapest listing of this item right now, cents' })
  market!: number | null;

  @ApiProperty({ nullable: true, description: 'How much similar blue sells above a plain pattern' })
  multiplier!: number | null;

  @ApiProperty({ nullable: true, description: 'Market price times the multiplier, cents' })
  estimate!: number | null;

  @ApiProperty({ nullable: true, description: 'Estimate minus market price, cents' })
  premium!: number | null;

  @ApiProperty({ type: [Number], description: 'Play side blue range counted as similar, percent' })
  band!: [number, number];

  comparableCount!: number;

  @ApiProperty({ description: 'Recent CSFloat sales of this skin in every wear' })
  checked!: number;

  @ApiProperty({ nullable: true, description: 'Days the similar sales span' })
  spanDays!: number | null;

  @ApiProperty({ type: [BlueSaleDto] })
  sales!: BlueSaleDto[];
}
