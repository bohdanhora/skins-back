import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessController } from './access.controller';
import { AccessGuard } from './access.guard';
import { AccessService } from './access.service';

@Module({
  controllers: [AccessController],
  providers: [AccessService, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AccessModule {}
