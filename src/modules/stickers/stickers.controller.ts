import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ListingsDto } from '../listings/dto/listings.dto';
import { ListingsService, type ListingSort } from '../listings/listings.service';

const MAX_STICKERS = 5;
const SORTS: ListingSort[] = ['deal', 'overpay', 'price'];

class SkinsWithStickersQueryDto {
  @ApiPropertyOptional({ type: [String], description: 'Sticker names, all must be applied' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [value] : value))
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STICKERS)
  stickers!: string[];

  @ApiPropertyOptional({
    description:
      'Which item the stickers must be on: an exact name or any part of it, e.g. "AK-47"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  item?: string;

  @ApiPropertyOptional({
    enum: SORTS,
    default: 'deal',
    description:
      'deal: smallest overpay for the stickers first; overpay: in dollars; price: cheapest',
  })
  @IsOptional()
  @IsIn(SORTS)
  sort: ListingSort = 'deal';

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
      item: query.item,
      sort: query.sort,
      priceFrom: toCents(query.minPrice),
      priceTo: toCents(query.maxPrice),
      limit: query.limit,
    });
  }
}
