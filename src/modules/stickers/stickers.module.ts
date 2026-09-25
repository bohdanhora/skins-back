import { Module } from '@nestjs/common';

import { ItemsModule } from '../items/items.module';
import { StickersController } from './stickers.controller';

@Module({
  imports: [ItemsModule],
  controllers: [StickersController],
})
export class StickersModule {}
