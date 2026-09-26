import { Module } from '@nestjs/common';

import { DmarketModule } from '../dmarket/dmarket.module';
import { CsfloatModule } from '../csfloat/csfloat.module';
import { ListingsService } from '../listings/listings.service';
import { PricesModule } from '../prices/prices.module';
import { WhiteMarketModule } from '../white-market/white-market.module';
import { SteamModule } from '../steam/steam.module';
import { BlueGemService } from './blue-gem.service';
import { BlueValueService } from './blue-value.service';
import { PatternImagesService } from './pattern-images.service';
import { FloatSearchService } from './float-search.service';
import { ItemIndexService } from './item-index.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [PricesModule, WhiteMarketModule, DmarketModule, CsfloatModule, SteamModule],
  controllers: [ItemsController],
  providers: [
    ItemIndexService,
    ListingsService,
    ItemsService,
    FloatSearchService,
    BlueGemService,
    BlueValueService,
    PatternImagesService,
  ],
  exports: [ItemIndexService, ListingsService],
})
export class ItemsModule {}
