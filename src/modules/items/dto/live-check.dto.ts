import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const MAX_NAMES = 60;

export class LiveCheckInputDto {
  @ApiProperty({ type: [String], description: 'Exact names of the items on screen' })
  @IsArray()
  @ArrayMaxSize(MAX_NAMES)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(256, { each: true })
  names!: string[];
}

export class LiveCheckDto {
  @ApiProperty({ type: [String], description: 'Items whose prices differ after the check' })
  changed!: string[];

  @ApiProperty()
  checkedAt!: string;
}
