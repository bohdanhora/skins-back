import { Module } from '@nestjs/common';

import { DmarketDepthClient } from './dmarket-depth.client';
import { DmarketPricesClient } from './dmarket-prices.client';
import { DmarketRateLimiter } from './dmarket-rate-limiter';
import { DmarketSalesClient } from './dmarket-sales.client';
import { DmarketTradingClient } from './dmarket-trading.client';

@Module({
  providers: [
    DmarketRateLimiter,
    DmarketDepthClient,
    DmarketPricesClient,
    DmarketSalesClient,
    DmarketTradingClient,
  ],
  exports: [DmarketDepthClient, DmarketPricesClient, DmarketSalesClient, DmarketTradingClient],
})
export class DmarketModule {}
