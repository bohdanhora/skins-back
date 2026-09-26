import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { SettingsDto, SettingsPatchDto, Theme } from './dto/settings.dto';
import { UserSettingsEntity } from './user-settings.entity';

const toDto = (entity: UserSettingsEntity | null): SettingsDto => ({
  fees: entity?.fees ?? null,
  withdrawals: entity?.withdrawals ?? null,
  steamProfile: entity?.steamProfile ?? null,
  theme: (entity?.theme as Theme | null) ?? null,
});

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly settings: Repository<UserSettingsEntity>,
  ) {}

  async get(userId: string): Promise<SettingsDto> {
    return toDto(await this.settings.findOne({ where: { userId } }));
  }

  async update(userId: string, patch: SettingsPatchDto): Promise<SettingsDto> {
    const existing =
      (await this.settings.findOne({ where: { userId } })) ??
      this.settings.create({
        userId,
        fees: null,
        withdrawals: null,
        steamProfile: null,
        theme: null,
      });

    if (patch.fees) existing.fees = { ...patch.fees };
    if (patch.withdrawals) existing.withdrawals = { ...patch.withdrawals };
    if (patch.steamProfile !== undefined) existing.steamProfile = patch.steamProfile.trim() || null;
    if (patch.theme) existing.theme = patch.theme;

    return toDto(await this.settings.save(existing));
  }
}
