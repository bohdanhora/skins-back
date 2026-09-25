import { Module } from '@nestjs/common';

import { SteamMarketClient } from './steam-market.client';

@Module({
  providers: [SteamMarketClient],
  exports: [SteamMarketClient],
})
export class SteamModule {}
