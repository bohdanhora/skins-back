import { Module } from '@nestjs/common';

import { CsfloatClient } from './csfloat.client';

@Module({
  providers: [CsfloatClient],
  exports: [CsfloatClient],
})
export class CsfloatModule {}
