import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { BettingModule } from '../betting/betting.module';
import { CsfloatModule } from '../csfloat/csfloat.module';
import { ItemsModule } from '../items/items.module';
import { PricesModule } from '../prices/prices.module';
import { AssistantProviderEntity } from './assistant-provider.entity';
import { AssistantTasksService } from './assistant-tasks.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { ModelClientService } from './model-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssistantProviderEntity]),
    AuthModule,
    BettingModule,
    CsfloatModule,
    ItemsModule,
    PricesModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantTasksService, ModelClientService],
})
export class AssistantModule {}
