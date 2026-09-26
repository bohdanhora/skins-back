import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { PurchaseDto, PurchaseInputDto, PurchaseMarket } from './dto/purchase.dto';
import { PurchaseEntity } from './purchase.entity';

const toDto = (entity: PurchaseEntity): PurchaseDto => ({
  id: entity.id,
  name: entity.name,
  image: entity.image,
  rarityColor: entity.rarityColor,
  price: entity.price,
  amount: entity.amount,
  market: entity.market as PurchaseMarket,
  boughtAt: entity.boughtAt.toISOString(),
  unlockAt: entity.unlockAt.toISOString(),
  float: entity.float,
  paintSeed: entity.paintSeed,
  note: entity.note,
  assetId: entity.assetId,
  sale:
    entity.soldMarket !== null && entity.soldReceived !== null && entity.soldAt !== null
      ? {
          market: entity.soldMarket as PurchaseMarket,
          received: entity.soldReceived,
          soldAt: entity.soldAt.toISOString(),
        }
      : null,
});

const toColumns = (input: PurchaseInputDto): Partial<PurchaseEntity> => ({
  name: input.name,
  image: input.image ?? null,
  rarityColor: input.rarityColor ?? null,
  price: input.price,
  amount: input.amount,
  market: input.market,
  boughtAt: new Date(input.boughtAt),
  unlockAt: new Date(input.unlockAt),
  float: input.float ?? null,
  paintSeed: input.paintSeed ?? null,
  note: input.note.trim(),
  assetId: input.assetId ?? null,
  soldMarket: input.sale?.market ?? null,
  soldReceived: input.sale?.received ?? null,
  soldAt: input.sale ? new Date(input.sale.soldAt) : null,
});

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(PurchaseEntity) private readonly purchases: Repository<PurchaseEntity>,
  ) {}

  async list(userId: string): Promise<PurchaseDto[]> {
    const rows = await this.purchases.find({
      where: { userId },
      order: { boughtAt: 'DESC', createdAt: 'DESC' },
    });

    return rows.map(toDto);
  }

  async create(userId: string, input: PurchaseInputDto): Promise<PurchaseDto> {
    const saved = await this.purchases.save(this.purchases.create({ ...toColumns(input), userId }));

    return toDto(saved);
  }

  async update(userId: string, id: string, input: PurchaseInputDto): Promise<PurchaseDto> {
    const existing = await this.purchases.findOne({ where: { id, userId } });

    if (!existing) {
      throw new NotFoundException('Purchase not found');
    }

    return toDto(await this.purchases.save(Object.assign(existing, toColumns(input))));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.purchases.delete({ id, userId });

    if (!result.affected) {
      throw new NotFoundException('Purchase not found');
    }
  }

  async import(userId: string, inputs: PurchaseInputDto[]): Promise<PurchaseDto[]> {
    await this.purchases.save(
      inputs.map((input) => this.purchases.create({ ...toColumns(input), userId })),
    );

    return this.list(userId);
  }
}
