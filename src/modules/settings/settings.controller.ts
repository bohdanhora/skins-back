import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { UserEntity } from '../auth/user.entity';
import { SettingsDto, SettingsPatchDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Settings of the signed in user, null where never saved' })
  @ApiOkResponse({ type: SettingsDto })
  get(@CurrentUser() user: UserEntity): Promise<SettingsDto> {
    return this.settings.get(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Save the given settings and keep the rest' })
  @ApiOkResponse({ type: SettingsDto })
  update(@CurrentUser() user: UserEntity, @Body() body: SettingsPatchDto): Promise<SettingsDto> {
    return this.settings.update(user.id, body);
  }
}
