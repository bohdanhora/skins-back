import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import type { UserEntity } from './user.entity';

interface AuthedRequest extends Request {
  user?: UserEntity;
  token?: string;
}

const BEARER = /^Bearer\s+(\S+)$/i;

export const readToken = (request: Request): string | null =>
  request.headers.authorization?.match(BEARER)?.[1] ?? null;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readToken(request);
    const user = token ? await this.auth.findUser(token) : null;

    if (!user || !token) {
      throw new UnauthorizedException('Sign in with Steam');
    }

    request.user = user;
    request.token = token;
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): UserEntity =>
    context.switchToHttp().getRequest<AuthedRequest>().user!,
);

export const CurrentToken = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthedRequest>().token!,
);
