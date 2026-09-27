import { ApiProperty } from '@nestjs/swagger';

export class BuyOrderDto {
  @ApiProperty({ description: 'Cents' })
  price!: number;

  amount!: number;

  @ApiProperty({ nullable: true, type: [Number], description: 'Float range, null for any float' })
  floatRange!: [number, number] | null;
}

export class BuyOrdersDto {
  @ApiProperty({ type: BuyOrderDto, nullable: true, description: 'Best CSFloat buy order' })
  csfloat!: BuyOrderDto | null;

  @ApiProperty({
    nullable: true,
    description: 'Float of the cheapest lot the orders were read for',
  })
  float!: number | null;

  @ApiProperty({ description: 'CSFloat could not be read' })
  unavailable!: boolean;
}
