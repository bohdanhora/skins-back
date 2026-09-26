import { Module } from '@nestjs/common';

import { ExchangeRateClient } from './exchange-rate.client';
import { SteamInventoryClient } from './steam-inventory.client';
import { SteamMarketClient } from './steam-market.client';

@Module({
  providers: [SteamMarketClient, SteamInventoryClient, ExchangeRateClient],
  exports: [SteamMarketClient, SteamInventoryClient],
})
export class SteamModule {}
