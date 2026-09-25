import { Module } from '@nestjs/common';

import { DmarketModule } from '../dmarket/dmarket.module';
import { ListingsService } from '../listings/listings.service';
import { PricesModule } from '../prices/prices.module';
import { WhiteMarketModule } from '../white-market/white-market.module';
import { FloatSearchService } from './float-search.service';
import { ItemIndexService } from './item-index.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [PricesModule, WhiteMarketModule, DmarketModule],
  controllers: [ItemsController],
  providers: [ItemIndexService, ListingsService, ItemsService, FloatSearchService],
  exports: [ItemIndexService, ListingsService],
})
export class ItemsModule {}
