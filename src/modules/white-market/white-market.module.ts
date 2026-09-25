import { Module } from '@nestjs/common';

import { WhiteMarketExportClient } from './white-market-export.client';
import { WhiteMarketPartnerClient } from './white-market-partner.client';

@Module({
  providers: [WhiteMarketExportClient, WhiteMarketPartnerClient],
  exports: [WhiteMarketExportClient, WhiteMarketPartnerClient],
})
export class WhiteMarketModule {}
