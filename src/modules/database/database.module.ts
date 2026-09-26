import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../../config/app.config';
import { AccountsAndPurchases1790000000000 } from '../../migrations/1790000000000-accounts-and-purchases';
import { FavoritesAndSettings1790000000001 } from '../../migrations/1790000000001-favorites-and-settings';
import { SessionEntity } from '../auth/session.entity';
import { UserEntity } from '../auth/user.entity';
import { FavoriteEntity } from '../favorites/favorite.entity';
import { PurchaseEntity } from '../purchases/purchase.entity';
import { UserSettingsEntity } from '../settings/user-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<DatabaseConfig>('database');

        return {
          type: 'postgres',
          url: config.url,
          ssl: config.ssl ? { rejectUnauthorized: false } : false,
          entities: [UserEntity, SessionEntity, PurchaseEntity, FavoriteEntity, UserSettingsEntity],
          migrations: [AccountsAndPurchases1790000000000, FavoritesAndSettings1790000000001],
          migrationsRun: true,
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
