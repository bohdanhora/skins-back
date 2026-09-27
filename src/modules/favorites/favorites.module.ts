import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { FavoriteSetEntity } from './favorite-set.entity';
import { FavoriteSetsController } from './favorite-sets.controller';
import { FavoriteSetsService } from './favorite-sets.service';
import { FavoriteEntity } from './favorite.entity';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteEntity, FavoriteSetEntity]), AuthModule],
  controllers: [FavoritesController, FavoriteSetsController],
  providers: [FavoritesService, FavoriteSetsService],
})
export class FavoritesModule {}
