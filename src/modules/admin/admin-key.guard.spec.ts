import { NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import { AdminKeyGuard, isAdminKeyValid } from './admin-key.guard';

const KEY = 'a'.repeat(40);

const contextWith = (header: string | undefined): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ header: () => header }),
    }),
  }) as unknown as ExecutionContext;

describe('isAdminKeyValid', () => {
  it('accepts the configured key', () => {
    expect(isAdminKeyValid(KEY, KEY)).toBe(true);
  });

  it('rejects a different key, a missing key and an empty configuration', () => {
    expect(isAdminKeyValid('b'.repeat(40), KEY)).toBe(false);
    expect(isAdminKeyValid(undefined, KEY)).toBe(false);
    expect(isAdminKeyValid('', '')).toBe(false);
  });
});

describe('AdminKeyGuard', () => {
  it('hides the routes when no key is configured', () => {
    const guard = new AdminKeyGuard({ apiKey: '', isEnabled: false });

    expect(() => guard.canActivate(contextWith(KEY))).toThrow(NotFoundException);
  });

  it('refuses a request without the right key', () => {
    const guard = new AdminKeyGuard({ apiKey: KEY, isEnabled: true });

    expect(() => guard.canActivate(contextWith('wrong'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(UnauthorizedException);
  });

  it('lets the right key through', () => {
    const guard = new AdminKeyGuard({ apiKey: KEY, isEnabled: true });

    expect(guard.canActivate(contextWith(KEY))).toBe(true);
  });
});
