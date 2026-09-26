import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { TradeUpCatalogDto } from './dto/trade-ups.dto';
import { TradeUpsService } from './trade-ups.service';

@ApiTags('trade-ups')
@Controller('trade-ups')
export class TradeUpsController {
  constructor(private readonly tradeUps: TradeUpsService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Every trade-up skin with rarity, collections, float range and prices' })
  @ApiOkResponse({ type: TradeUpCatalogDto })
  catalog(): TradeUpCatalogDto {
    return this.tradeUps.catalogue();
  }
}
