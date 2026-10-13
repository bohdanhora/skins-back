import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { FavoriteSetDto, FavoriteSetInputDto } from './dto/favorite-set.dto';
import { FavoriteSetEntity } from './favorite-set.entity';
import { text } from '../../common/i18n/messages';

const MAX_SETS = 30;

const toDto = (entity: FavoriteSetEntity): FavoriteSetDto => ({
  id: entity.id,
  name: entity.name,
  items: entity.items ?? [],
  updatedAt: entity.updatedAt.toISOString(),
});

const clean = (input: FavoriteSetInputDto) => ({
  name: input.name.trim(),
  items: [...new Set(input.items.map((name) => name.trim()).filter(Boolean))],
});

@Injectable()
export class FavoriteSetsService {
  constructor(
    @InjectRepository(FavoriteSetEntity) private readonly sets: Repository<FavoriteSetEntity>,
  ) {}

  async list(userId: string): Promise<FavoriteSetDto[]> {
    const rows = await this.sets.find({ where: { userId }, order: { createdAt: 'ASC' } });

    return rows.map(toDto);
  }

  async create(userId: string, input: FavoriteSetInputDto): Promise<FavoriteSetDto> {
    if ((await this.sets.count({ where: { userId } })) >= MAX_SETS) {
      throw new BadRequestException(text('setLimit', { limit: MAX_SETS }));
    }

    return toDto(await this.sets.save(this.sets.create({ ...clean(input), userId })));
  }

  async update(userId: string, id: string, input: FavoriteSetInputDto): Promise<FavoriteSetDto> {
    const existing = await this.sets.findOne({ where: { id, userId } });

    if (!existing) throw new NotFoundException(text('setNotFound'));

    return toDto(await this.sets.save(Object.assign(existing, clean(input))));
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.sets.delete({ id, userId });

    if (!result.affected) throw new NotFoundException(text('setNotFound'));
  }
}
