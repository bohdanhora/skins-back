import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  dmarketConfig,
  whiteMarketConfig,
  type DmarketConfig,
  type WhiteMarketConfig,
} from '../../config/app.config';
import { CatalogService } from '../catalog/catalog.service';
import { PriceBoardService } from './price-board.service';
import { SalesHistoryService } from './sales-history.service';

export class MarketStatusDto {
  updatedAt!: string | null;
  items!: number;
  error!: string | null;
  /** Whether the optional keys are set, which unlocks listings and sticker search. */
  keysConfigured!: boolean;
}

export class StatusDto {
  whiteMarket!: MarketStatusDto;
  dmarket!: MarketStatusDto;
  refreshing!: boolean;
  comparedItems!: number;
  catalogItems!: number;
  /** How many liquid items already have a fresh sales summary. */
  salesChecked!: number;
  salesTotal!: number;
}

@ApiTags('status')
@Controller('status')
export class StatusController {
  constructor(
    private readonly board: PriceBoardService,
    private readonly catalog: CatalogService,
    private readonly sales: SalesHistoryService,
    @Inject(whiteMarketConfig.KEY) private readonly whiteMarketSettings: WhiteMarketConfig,
    @Inject(dmarketConfig.KEY) private readonly dmarketSettings: DmarketConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Freshness of prices and which optional keys are set' })
  @ApiOkResponse({ type: StatusDto })
  status(): StatusDto {
    const { whiteMarket, dmarket } = this.board.state;
    const progress = this.sales.progress();

    return {
      whiteMarket: { ...whiteMarket, keysConfigured: this.whiteMarketSettings.isPartnerEnabled },
      dmarket: { ...dmarket, keysConfigured: this.dmarketSettings.isTradingEnabled },
      refreshing: this.board.isRefreshing,
      comparedItems: this.board.all().length,
      catalogItems: this.catalog.size,
      salesChecked: progress.checked,
      salesTotal: progress.total,
    };
  }
}
