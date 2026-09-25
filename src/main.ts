import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { appConfig, type AppConfig } from './config/app.config';

const API_PREFIX = 'api';
const DOCS_PATH = 'api/docs';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.setGlobalPrefix(API_PREFIX);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const config = app.get<AppConfig>(appConfig.KEY);

  app.enableCors({ origin: config.corsOrigins });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Skins API')
      .setDescription(
        'CS2 price comparison between white.market and DMarket. Money is in US cents unless a field says USD.',
      )
      .setVersion('0.1.0')
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document);

  await app.listen(config.port);
  logger.log(`Skins API listening on port ${config.port}`);
}

void bootstrap();
