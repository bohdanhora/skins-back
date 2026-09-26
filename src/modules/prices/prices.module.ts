import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { DmarketModule } from '../dmarket/dmarket.module';
import { CsfloatModule } from '../csfloat/csfloat.module';
import { LisSkinsModule } from '../lis-skins/lis-skins.module';
import { WhiteMarketModule } from '../white-market/white-market.module';
import { PriceBoardService } from './price-board.service';
import { SalesHistoryService } from './sales-history.service';
import { StatusController } from './status.controller';

@Module({
  imports: [CatalogModule, WhiteMarketModule, DmarketModule, CsfloatModule, LisSkinsModule],
  controllers: [StatusController],
  providers: [PriceBoardService, SalesHistoryService],
  exports: [PriceBoardService, SalesHistoryService, CatalogModule],
})
export class PricesModule {}
