import { Module } from '@nestjs/common';

import { ItemsModule } from '../items/items.module';
import { PricesModule } from '../prices/prices.module';
import { SteamModule } from '../steam/steam.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [ItemsModule, PricesModule, SteamModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
