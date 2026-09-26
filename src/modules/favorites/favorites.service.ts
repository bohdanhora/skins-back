import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FavoriteEntity } from './favorite.entity';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(FavoriteEntity) private readonly favorites: Repository<FavoriteEntity>,
  ) {}

  async list(userId: string): Promise<string[]> {
    const rows = await this.favorites.find({
      where: { userId },
      order: { createdAt: 'DESC', name: 'ASC' },
    });

    return rows.map((row) => row.name);
  }

  async add(userId: string, names: string[]): Promise<void> {
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

    if (unique.length === 0) return;

    await this.favorites
      .createQueryBuilder()
      .insert()
      .values(unique.map((name) => ({ userId, name })))
      .orIgnore()
      .execute();
  }

  async remove(userId: string, name: string): Promise<void> {
    await this.favorites.delete({ userId, name });
  }
}
