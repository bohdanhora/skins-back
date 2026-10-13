import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SessionEntity } from '../auth/session.entity';
import { UserEntity } from '../auth/user.entity';
import { FavoriteSetEntity } from '../favorites/favorite-set.entity';
import { FavoriteEntity } from '../favorites/favorite.entity';
import { PurchaseEntity } from '../purchases/purchase.entity';
import { UserSettingsEntity } from '../settings/user-settings.entity';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      SessionEntity,
      PurchaseEntity,
      FavoriteEntity,
      FavoriteSetEntity,
      UserSettingsEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminKeyGuard],
})
export class AdminModule {}
