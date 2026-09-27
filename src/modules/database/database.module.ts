import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../../config/app.config';
import { AccountsAndPurchases1790000000000 } from '../../migrations/1790000000000-accounts-and-purchases';
import { FavoritesAndSettings1790000000001 } from '../../migrations/1790000000001-favorites-and-settings';
import { BettingHistory1790000000002 } from '../../migrations/1790000000002-betting-history';
import { PurchaseStickers1790000000003 } from '../../migrations/1790000000003-purchase-stickers';
import { AssistantProviders1790000000004 } from '../../migrations/1790000000004-assistant-providers';
import { FavoriteSets1790000000005 } from '../../migrations/1790000000005-favorite-sets';
import { AssistantProviderEntity } from '../assistant/assistant-provider.entity';
import { SessionEntity } from '../auth/session.entity';
import { UserEntity } from '../auth/user.entity';
import { MapResultEntity } from '../betting/map-result.entity';
import { SourcePageEntity } from '../betting/source-page.entity';
import { FavoriteSetEntity } from '../favorites/favorite-set.entity';
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
          entities: [
            UserEntity,
            SessionEntity,
            PurchaseEntity,
            FavoriteEntity,
            UserSettingsEntity,
            MapResultEntity,
            SourcePageEntity,
            AssistantProviderEntity,
            FavoriteSetEntity,
          ],
          migrations: [
            AccountsAndPurchases1790000000000,
            FavoritesAndSettings1790000000001,
            BettingHistory1790000000002,
            PurchaseStickers1790000000003,
            AssistantProviders1790000000004,
            FavoriteSets1790000000005,
          ],
          migrationsRun: true,
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
