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
import { FavoriteSetDto, FavoriteSetInputDto } from './dto/favorite-set.dto';
import { FavoriteSetsService } from './favorite-sets.service';

const NO_CONTENT = 204;

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('favorite-sets')
export class FavoriteSetsController {
  constructor(private readonly sets: FavoriteSetsService) {}

  @Get()
  @ApiOperation({ summary: 'Named loadouts of the signed in user, like a knife with gloves' })
  @ApiOkResponse({ type: [FavoriteSetDto] })
  list(@CurrentUser() user: UserEntity): Promise<FavoriteSetDto[]> {
    return this.sets.list(user.id);
  }

  @Post()
  @ApiOkResponse({ type: FavoriteSetDto })
  create(
    @CurrentUser() user: UserEntity,
    @Body() body: FavoriteSetInputDto,
  ): Promise<FavoriteSetDto> {
    return this.sets.create(user.id, body);
  }

  @Put(':id')
  @ApiOkResponse({ type: FavoriteSetDto })
  update(
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FavoriteSetInputDto,
  ): Promise<FavoriteSetDto> {
    return this.sets.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.sets.remove(user.id, id);
  }
}
