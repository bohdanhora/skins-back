import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ItemCategory } from '../../../domain/categories';

export class ItemLibraryQueryDto {
  @ApiPropertyOptional({ enum: ItemCategory })
  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  weapon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  skin?: string;
}

export interface ItemLibraryOptionDto {
  value: string;
  image: string | null;
  count: number;
  price: number | null;
}

export interface ItemLibraryVariantDto {
  name: string;
  image: string | null;
  price: number | null;
  phase: string | null;
}

export interface ItemLibraryDto {
  categories: { value: ItemCategory; count: number }[];
  weapons: ItemLibraryOptionDto[];
  skins: ItemLibraryOptionDto[];
  variants: ItemLibraryVariantDto[];
}

export interface ItemFacetsDto {
  collections: { name: string; image: string | null }[];
  subcategories: Record<string, { value: string; image: string | null; count: number }[]>;
}
