import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ListingsDto } from '../listings/dto/listings.dto';
import { ListingsService } from '../listings/listings.service';

const MAX_STICKERS = 5;

class SkinsWithStickersQueryDto {
  @ApiPropertyOptional({ type: [String], description: 'Sticker names, all must be applied' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value))
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STICKERS)
  stickers!: string[];

  @ApiPropertyOptional({ description: 'USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'USD' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ default: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 40;
}

const toCents = (dollars: number | undefined): number | undefined =>
  dollars === undefined ? undefined : Math.round(dollars * 100);

@ApiTags('stickers')
@Controller('stickers')
export class StickersController {
  constructor(private readonly listings: ListingsService) {}

  @Get('skins')
  @ApiOperation({ summary: 'Skins for sale with the chosen stickers applied, on both markets' })
  @ApiOkResponse({ type: ListingsDto })
  skins(@Query() query: SkinsWithStickersQueryDto): Promise<ListingsDto> {
    return this.listings.search({
      stickers: query.stickers,
      priceFrom: toCents(query.minPrice),
      priceTo: toCents(query.maxPrice),
      limit: query.limit,
    });
  }
}
