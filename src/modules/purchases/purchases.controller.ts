import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { UserEntity } from '../auth/user.entity';
import { PurchaseDto, PurchaseImportDto, PurchaseInputDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

const NO_CONTENT = 204;

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @ApiOperation({ summary: 'Everything the signed in user bought, newest first' })
  @ApiOkResponse({ type: [PurchaseDto] })
  list(@CurrentUser() user: UserEntity): Promise<PurchaseDto[]> {
    return this.purchases.list(user.id);
  }

  @Post()
  @ApiOkResponse({ type: PurchaseDto })
  create(@CurrentUser() user: UserEntity, @Body() body: PurchaseInputDto): Promise<PurchaseDto> {
    return this.purchases.create(user.id, body);
  }

  @Post('import')
  @ApiOperation({ summary: 'Add many purchases at once, for example from a backup file' })
  @ApiOkResponse({ type: [PurchaseDto] })
  import(@CurrentUser() user: UserEntity, @Body() body: PurchaseImportDto): Promise<PurchaseDto[]> {
    return this.purchases.import(user.id, body.purchases);
  }

  @Put(':id')
  @ApiOkResponse({ type: PurchaseDto })
  update(
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PurchaseInputDto,
  ): Promise<PurchaseDto> {
    return this.purchases.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.purchases.remove(user.id, id);
  }
}
