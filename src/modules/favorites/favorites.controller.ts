import { Body, Controller, Delete, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import type { UserEntity } from '../auth/user.entity';
import { FavoriteImportDto, FavoriteNameDto } from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

const NO_CONTENT = 204;

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Item names the signed in user follows, newest first' })
  @ApiOkResponse({ type: [String] })
  list(@CurrentUser() user: UserEntity): Promise<string[]> {
    return this.favorites.list(user.id);
  }

  @Post()
  @HttpCode(NO_CONTENT)
  async add(@CurrentUser() user: UserEntity, @Body() body: FavoriteNameDto): Promise<void> {
    await this.favorites.add(user.id, [body.name]);
  }

  @Post('import')
  @ApiOperation({ summary: 'Add many names at once, already followed ones are kept' })
  @ApiOkResponse({ type: [String] })
  async import(
    @CurrentUser() user: UserEntity,
    @Body() body: FavoriteImportDto,
  ): Promise<string[]> {
    await this.favorites.add(user.id, body.names);

    return this.favorites.list(user.id);
  }

  @Delete()
  @HttpCode(NO_CONTENT)
  async remove(@CurrentUser() user: UserEntity, @Query() query: FavoriteNameDto): Promise<void> {
    await this.favorites.remove(user.id, query.name);
  }
}
