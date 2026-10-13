import { createHash, timingSafeEqual } from 'node:crypto';

import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { adminConfig, type AdminConfig } from '../../config/app.config';

export const ADMIN_KEY_HEADER = 'x-admin-key';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

export const isAdminKeyValid = (provided: string | undefined, expected: string): boolean =>
  Boolean(provided) &&
  expected.length > 0 &&
  timingSafeEqual(digest(provided ?? ''), digest(expected));

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(@Inject(adminConfig.KEY) private readonly config: AdminConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.isEnabled) {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!isAdminKeyValid(request.header(ADMIN_KEY_HEADER), this.config.apiKey)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
