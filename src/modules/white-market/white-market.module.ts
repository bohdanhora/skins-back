import { Module } from '@nestjs/common';

import { WhiteMarketExportClient } from './white-market-export.client';
import { WhiteMarketPartnerClient } from './white-market-partner.client';
import { WhiteMarketStatsClient } from './white-market-stats.client';

@Module({
  providers: [WhiteMarketExportClient, WhiteMarketPartnerClient, WhiteMarketStatsClient],
  exports: [WhiteMarketExportClient, WhiteMarketPartnerClient, WhiteMarketStatsClient],
})
export class WhiteMarketModule {}
