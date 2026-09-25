import { Module } from '@nestjs/common';

import { DmarketModule } from '../dmarket/dmarket.module';
import { ItemsModule } from '../items/items.module';
import { PricesModule } from '../prices/prices.module';
import { WhiteMarketModule } from '../white-market/white-market.module';
import { FloatSnipeScannerService } from './float-snipe-scanner.service';
import { SnipesController } from './snipes.controller';

@Module({
  imports: [PricesModule, ItemsModule, DmarketModule, WhiteMarketModule],
  controllers: [SnipesController],
  providers: [FloatSnipeScannerService],
})
export class SnipesModule {}
