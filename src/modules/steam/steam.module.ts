import { Module } from '@nestjs/common';

import { SteamInventoryClient } from './steam-inventory.client';
import { SteamMarketClient } from './steam-market.client';

@Module({
  providers: [SteamMarketClient, SteamInventoryClient],
  exports: [SteamMarketClient, SteamInventoryClient],
})
export class SteamModule {}
