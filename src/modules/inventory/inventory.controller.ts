import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { InventoryDto, InventoryQueryDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiOperation({ summary: 'Public Steam CS2 inventory valued on every market after fees' })
  @ApiOkResponse({ type: InventoryDto })
  get(@Query() query: InventoryQueryDto): Promise<InventoryDto> {
    return this.inventory.get(query);
  }
}
