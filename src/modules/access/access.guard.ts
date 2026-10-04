import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AccessService } from './access.service';
import { IS_PUBLIC } from './public.decorator';

export const ACCESS_HEADER = 'x-access-token';
export const ACCESS_REQUIRED = 'access_required';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.access.enabled) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const token = context.switchToHttp().getRequest<Request>().header(ACCESS_HEADER);

    if (!token || !this.access.verifyToken(token)) {
      throw new ForbiddenException(ACCESS_REQUIRED);
    }

    return true;
  }
}
