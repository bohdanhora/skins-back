import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { UserEntity } from '../auth/user.entity';
import { AssistantTasksService } from './assistant-tasks.service';
import { AssistantService } from './assistant.service';
import {
  AssistantModelsQueryDto,
  AssistantProviderDto,
  AssistantSettingsDto,
  AssistantSettingsInputDto,
  BluePicksDto,
  BluePicksInputDto,
  FloatPicksDto,
  FloatPicksInputDto,
  MatchBriefDto,
  PurchaseDraftDto,
  PurchaseDraftInputDto,
  SmartSearchDto,
  SmartSearchInputDto,
} from './dto/assistant.dto';

const NO_CONTENT = 204;
const TASK_LIMIT = { default: { ttl: 60_000, limit: 20 } };

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly tasks: AssistantTasksService,
  ) {}

  @Get('providers')
  @ApiOkResponse({ type: [AssistantProviderDto] })
  providers(): AssistantProviderDto[] {
    return this.assistant.catalog();
  }

  @Get('settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AssistantSettingsDto })
  settings(@CurrentUser() user: UserEntity): Promise<AssistantSettingsDto> {
    return this.assistant.settings(user.id);
  }

  @Put('settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save the provider and model, the key is stored encrypted' })
  @ApiOkResponse({ type: AssistantSettingsDto })
  save(
    @CurrentUser() user: UserEntity,
    @Body() body: AssistantSettingsInputDto,
  ): Promise<AssistantSettingsDto> {
    return this.assistant.save(user.id, body);
  }

  @Delete('settings')
  @HttpCode(NO_CONTENT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async remove(@CurrentUser() user: UserEntity): Promise<void> {
    await this.assistant.remove(user.id);
  }

  @Get('models')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Models the saved key can use, known ones first' })
  @ApiOkResponse({ type: [String] })
  models(
    @CurrentUser() user: UserEntity,
    @Query() query: AssistantModelsQueryDto,
  ): Promise<string[]> {
    return this.assistant.models(user.id, query.provider);
  }

  @Post('matches/:id/brief')
  @Throttle(TASK_LIMIT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check team news on the web and judge the best bet of a match' })
  @ApiOkResponse({ type: MatchBriefDto })
  brief(
    @CurrentUser() user: UserEntity,
    @Param('id', ParseIntPipe) id: number,
    @Query('refresh') refresh?: string,
  ): Promise<MatchBriefDto> {
    return this.tasks.brief(user.id, id, refresh === 'true');
  }

  @Post('purchase-draft')
  @Throttle(TASK_LIMIT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read a purchase from a screenshot, a listing link or text' })
  @ApiOkResponse({ type: PurchaseDraftDto })
  draft(
    @CurrentUser() user: UserEntity,
    @Body() body: PurchaseDraftInputDto,
  ): Promise<PurchaseDraftDto> {
    return this.tasks.draft(user.id, body);
  }

  @Post('blue-picks')
  @Throttle(TASK_LIMIT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Bluest Case Hardened listings ranked by how far below similar sales they sit',
  })
  @ApiOkResponse({ type: BluePicksDto })
  bluePicks(
    @CurrentUser() user: UserEntity,
    @Body() body: BluePicksInputDto,
  ): Promise<BluePicksDto> {
    return this.tasks.bluePicks(user.id, body);
  }

  @Post('float-picks')
  @Throttle(TASK_LIMIT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listings priced like worse floats, or that a buy order already pays more for',
  })
  @ApiOkResponse({ type: FloatPicksDto })
  floatPicks(
    @CurrentUser() user: UserEntity,
    @Body() body: FloatPicksInputDto,
  ): Promise<FloatPicksDto> {
    return this.tasks.floatPicks(user.id, body);
  }

  @Post('search')
  @Throttle(TASK_LIMIT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn a plain request into search filters' })
  @ApiOkResponse({ type: SmartSearchDto })
  search(
    @CurrentUser() user: UserEntity,
    @Body() body: SmartSearchInputDto,
  ): Promise<SmartSearchDto> {
    return this.tasks.search(user.id, body.query);
  }
}
