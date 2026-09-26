import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const MAX_FAVORITES = 2000;

export class FavoriteNameDto {
  @ApiProperty({ description: 'Exact item name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  name!: string;
}

export class FavoriteImportDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(256, { each: true })
  names!: string[];
}
