import { AccessService } from './access.service';

const DAY_MS = 86_400_000;
const NOW = 1_800_000_000_000;

const service = (password: string) => new AccessService({ password, days: 30 });

describe('access', () => {
  it('stays open when no password is set', () => {
    expect(service('').enabled).toBe(false);
    expect(service('').checkPassword('')).toBe(false);
  });

  it('accepts only the configured password', () => {
    const access = service('correct horse');

    expect(access.checkPassword('correct horse')).toBe(true);
    expect(access.checkPassword('wrong')).toBe(false);
  });

  it('verifies its own tokens until they expire', () => {
    const access = service('correct horse');
    const token = access.issueToken(NOW);

    expect(access.verifyToken(token, NOW + DAY_MS)).toBe(true);
    expect(access.verifyToken(token, NOW + 31 * DAY_MS)).toBe(false);
  });

  it('rejects tampered tokens and tokens from another password', () => {
    const token = service('correct horse').issueToken(NOW);
    const [expiresAt, signature] = token.split('.');

    expect(service('correct horse').verifyToken(`${Number(expiresAt) + 1}.${signature}`, NOW)).toBe(
      false,
    );
    expect(service('another one').verifyToken(token, NOW)).toBe(false);
    expect(service('correct horse').verifyToken('garbage', NOW)).toBe(false);
  });
});
