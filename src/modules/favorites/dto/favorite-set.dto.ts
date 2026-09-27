import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const MAX_ITEMS = 12;

export class FavoriteSetInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ type: [String], description: 'Exact item names' })
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(256, { each: true })
  items!: string[];
}

export class FavoriteSetDto extends FavoriteSetInputDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  updatedAt!: string;
}
