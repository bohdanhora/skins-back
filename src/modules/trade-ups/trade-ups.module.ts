import { Module } from '@nestjs/common';

import { PricesModule } from '../prices/prices.module';
import { TradeUpsController } from './trade-ups.controller';
import { TradeUpsService } from './trade-ups.service';

@Module({
  imports: [PricesModule],
  controllers: [TradeUpsController],
  providers: [TradeUpsService],
})
export class TradeUpsModule {}
