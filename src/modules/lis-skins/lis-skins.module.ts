import { Module } from '@nestjs/common';

import { LisSkinsClient } from './lis-skins.client';

@Module({
  providers: [LisSkinsClient],
  exports: [LisSkinsClient],
})
export class LisSkinsModule {}
