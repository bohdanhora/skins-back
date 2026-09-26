import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import {
  appConfig,
  authConfig,
  csfloatConfig,
  databaseConfig,
  dmarketConfig,
  syncConfig,
  whiteMarketConfig,
  type AppConfig,
} from './config/app.config';
import { validateEnvironment } from './config/environment';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './modules/database/database.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { HealthModule } from './modules/health/health.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ItemsModule } from './modules/items/items.module';
import { PricesModule } from './modules/prices/prices.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SnipesModule } from './modules/snipes/snipes.module';
import { StickersModule } from './modules/stickers/stickers.module';
import { TradeUpsModule } from './modules/trade-ups/trade-ups.module';

const GLOBAL_RATE_LIMIT = { ttl: 60_000, limit: 600 };

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        syncConfig,
        whiteMarketConfig,
        dmarketConfig,
        csfloatConfig,
      ],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<AppConfig>('app');

        return {
          pinoHttp: {
            level: config.logLevel,
            transport:
              !config.isProduction && process.stdout.isTTY ? { target: 'pino-pretty' } : undefined,
            autoLogging: { ignore: (request) => request.url === '/api/health' },
            serializers: {
              req: (request: { method?: string; url?: string }) => ({
                method: request.method,
                url: request.url,
              }),
              res: (response: { statusCode?: number }) => ({ statusCode: response.statusCode }),
            },
          },
        };
      },
    }),
    ThrottlerModule.forRoot({ throttlers: [GLOBAL_RATE_LIMIT] }),
    DatabaseModule,
    HealthModule,
    PricesModule,
    ItemsModule,
    StickersModule,
    SnipesModule,
    InventoryModule,
    TradeUpsModule,
    AuthModule,
    PurchasesModule,
    FavoritesModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
