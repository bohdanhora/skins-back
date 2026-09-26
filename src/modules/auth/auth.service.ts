import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { LessThan, MoreThan, Repository } from 'typeorm';

import { fetchText } from '../../common/http/fetch-json';
import { authConfig, type AuthConfig } from '../../config/app.config';
import {
  STEAM_OPENID_URL,
  claimedSteamId,
  isValidAssertion,
  loginUrl,
  safeNextPath,
  verificationBody,
  type OpenIdParams,
} from '../../domain/steam-openid';
import { SteamInventoryClient } from '../steam/steam-inventory.client';
import { SessionEntity } from './session.entity';
import { UserEntity } from './user.entity';

const DAY_MS = 86_400_000;
const TOKEN_BYTES = 32;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(authConfig.KEY) private readonly config: AuthConfig,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    private readonly steam: SteamInventoryClient,
  ) {}

  steamLoginUrl(next: unknown): string {
    return loginUrl(this.config.publicApiUrl, safeNextPath(next));
  }

  async completeSteamLogin(params: OpenIdParams): Promise<string> {
    const next = safeNextPath(params.next);
    const steamId = claimedSteamId(params, this.config.publicApiUrl);

    if (!steamId || !(await this.confirmWithSteam(params))) {
      return `${this.config.frontendUrl}/auth#error=steam`;
    }

    const user = await this.saveUser(steamId);
    const token = await this.openSession(user.id);

    return `${this.config.frontendUrl}/auth#token=${token}&next=${encodeURIComponent(next)}`;
  }

  async findUser(token: string): Promise<UserEntity | null> {
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });

    return session?.user ?? null;
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete({ tokenHash: hashToken(token) });
  }

  private async confirmWithSteam(params: OpenIdParams): Promise<boolean> {
    try {
      const answer = await fetchText(STEAM_OPENID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verificationBody(params).toString(),
        retries: 1,
      });

      return isValidAssertion(answer);
    } catch (error) {
      this.logger.warn(`Steam login check failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async saveUser(steamId: string): Promise<UserEntity> {
    const profile = await this.steam.resolveProfile(steamId).catch(() => null);
    const existing = await this.users.findOne({ where: { steamId } });
    const user = existing ?? this.users.create({ steamId, name: null, avatar: null });

    user.name = profile?.name ?? user.name;
    user.avatar = profile?.avatar ?? user.avatar;
    user.lastLoginAt = new Date();

    return this.users.save(user);
  }

  private async openSession(userId: string): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    await this.sessions.delete({ userId, expiresAt: LessThan(new Date()) });
    await this.sessions.save(
      this.sessions.create({
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + this.config.sessionDays * DAY_MS),
      }),
    );

    return token;
  }
}
