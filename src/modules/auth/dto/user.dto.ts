import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty()
  steamId!: string;

  @ApiProperty({ type: String, nullable: true })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatar!: string | null;
}
