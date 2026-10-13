import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { AccessService } from './access.service';
import { Public } from './public.decorator';
import { text } from '../../common/i18n/messages';

const OK = 200;
const LOGIN_ATTEMPTS_PER_MINUTE = 5;
const MINUTE_MS = 60_000;
const MAX_PASSWORD_LENGTH = 200;

class AccessLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string;
}

class AccessTokenDto {
  token!: string;
}

class AccessStatusDto {
  required!: boolean;
}

@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Whether the app asks for a password' })
  @ApiOkResponse({ type: AccessStatusDto })
  status(): AccessStatusDto {
    return { required: this.access.enabled };
  }

  @Public()
  @Throttle({ default: { limit: LOGIN_ATTEMPTS_PER_MINUTE, ttl: MINUTE_MS } })
  @Post()
  @HttpCode(OK)
  @ApiOperation({ summary: 'Exchange the app password for an access token' })
  @ApiOkResponse({ type: AccessTokenDto })
  login(@Body() dto: AccessLoginDto): AccessTokenDto {
    if (!this.access.checkPassword(dto.password)) {
      throw new UnauthorizedException(text('wrongPassword'));
    }

    return { token: this.access.issueToken() };
  }
}
