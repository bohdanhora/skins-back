import { Controller, Get, HttpCode, Post, Query, Redirect, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentToken, CurrentUser } from './auth.guard';
import { AuthService } from './auth.service';
import { UserDto } from './dto/user.dto';
import type { UserEntity } from './user.entity';

const NO_CONTENT = 204;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('steam')
  @Redirect()
  @ApiOperation({ summary: 'Start signing in with Steam' })
  steam(@Query('next') next?: string): { url: string } {
    return { url: this.auth.steamLoginUrl(next) };
  }

  @Get('steam/return')
  @Redirect()
  @ApiOperation({ summary: 'Steam sends the user back here after signing in' })
  async steamReturn(@Query() query: Record<string, unknown>): Promise<{ url: string }> {
    return { url: await this.auth.completeSteamLogin(query) };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: UserEntity): UserDto {
    return { steamId: user.steamId, name: user.name, avatar: user.avatar };
  }

  @Post('logout')
  @HttpCode(NO_CONTENT)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async logout(@CurrentToken() token: string): Promise<void> {
    await this.auth.logout(token);
  }
}
