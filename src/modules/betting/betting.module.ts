import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BettingSyncService } from './betting-sync.service';
import { BettingController } from './betting.controller';
import { BettingService } from './betting.service';
import { LiquipediaClient } from './clients/liquipedia.client';
import { OddsPapiClient } from './clients/oddspapi.client';
import { PandaScoreClient } from './clients/pandascore.client';
import { VrsClient } from './clients/vrs.client';
import { MapResultEntity } from './map-result.entity';
import { SourcePageEntity } from './source-page.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MapResultEntity, SourcePageEntity])],
  controllers: [BettingController],
  providers: [
    BettingService,
    BettingSyncService,
    LiquipediaClient,
    VrsClient,
    PandaScoreClient,
    OddsPapiClient,
  ],
  exports: [BettingService],
})
export class BettingModule {}
