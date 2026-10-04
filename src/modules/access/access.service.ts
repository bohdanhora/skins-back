import { Inject, Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { accessConfig, type AccessConfig } from '../../config/app.config';

const DAY_MS = 86_400_000;

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

@Injectable()
export class AccessService {
  private readonly key: Buffer;

  constructor(@Inject(accessConfig.KEY) private readonly config: AccessConfig) {
    this.key = digest(`access:${config.password}`);
  }

  get enabled(): boolean {
    return this.config.password.length > 0;
  }

  checkPassword(password: string): boolean {
    return this.enabled && timingSafeEqual(digest(password), digest(this.config.password));
  }

  issueToken(now = Date.now()): string {
    const expiresAt = String(now + this.config.days * DAY_MS);

    return `${expiresAt}.${this.sign(expiresAt)}`;
  }

  verifyToken(token: string, now = Date.now()): boolean {
    const [expiresAt, signature] = token.split('.');

    if (!expiresAt || !signature || Number(expiresAt) < now) {
      return false;
    }

    const expected = Buffer.from(this.sign(expiresAt));
    const actual = Buffer.from(signature);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private sign(value: string): string {
    return createHmac('sha256', this.key).update(value).digest('base64url');
  }
}
