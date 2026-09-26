import { ApiProperty } from '@nestjs/swagger';

import { BlueShareDto } from './blue-gem.dto';

export class BluePoseDto {
  @ApiProperty({ enum: ['playside', 'backside', 'frontview'] })
  pose!: 'playside' | 'backside' | 'frontview';

  @ApiProperty({ description: 'Add the seed and .avif to get the image' })
  base!: string;
}

export class PatternImagesDto {
  name!: string;
  pageUrl!: string;
  imageBase!: string;

  @ApiProperty({ type: [String], description: 'Image id per seed, empty when unknown' })
  images!: string[];

  @ApiProperty({ type: [BlueShareDto], nullable: true, description: 'Blue share per seed' })
  blue!: (BlueShareDto | null)[];

  @ApiProperty({ type: [BluePoseDto], description: 'Case Hardened renders per side' })
  poses!: BluePoseDto[];
}
