import {
  claimedSteamId,
  isValidAssertion,
  loginUrl,
  safeNextPath,
  verificationBody,
} from './steam-openid';

const API = 'https://api.example.com';

const assertion = (extra: Record<string, unknown> = {}) => ({
  next: '/purchases',
  'openid.ns': 'http://specs.openid.net/auth/2.0',
  'openid.mode': 'id_res',
  'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
  'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000001',
  'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001',
  'openid.return_to': `${API}/api/auth/steam/return?next=%2Fpurchases`,
  'openid.sig': 'abc',
  ...extra,
});

describe('steam openid', () => {
  it('sends the user to Steam with a return address on the API', () => {
    const url = new URL(loginUrl(API, '/purchases'));

    expect(url.origin + url.pathname).toBe('https://steamcommunity.com/openid/login');
    expect(url.searchParams.get('openid.realm')).toBe(API);
    expect(url.searchParams.get('openid.return_to')).toBe(
      `${API}/api/auth/steam/return?next=%2Fpurchases`,
    );
  });

  it('reads the SteamID from a well formed assertion', () => {
    expect(claimedSteamId(assertion(), API)).toBe('76561198000000001');
  });

  it('rejects assertions for another site or identity', () => {
    expect(claimedSteamId(assertion({ 'openid.return_to': 'https://evil.test/' }), API)).toBeNull();
    expect(
      claimedSteamId(assertion({ 'openid.claimed_id': 'https://evil.test/openid/id/1' }), API),
    ).toBeNull();
    expect(
      claimedSteamId(assertion({ 'openid.op_endpoint': 'https://evil.test/login' }), API),
    ).toBeNull();
    expect(claimedSteamId(assertion({ 'openid.mode': 'cancel' }), API)).toBeNull();
  });

  it('asks Steam to check the same signed fields', () => {
    const body = verificationBody(assertion());

    expect(body.get('openid.mode')).toBe('check_authentication');
    expect(body.get('openid.sig')).toBe('abc');
    expect(body.has('next')).toBe(false);
  });

  it('trusts only an explicit is_valid:true', () => {
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true);
    expect(isValidAssertion('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false);
  });

  it('keeps redirects inside the site', () => {
    expect(safeNextPath('/inventory')).toBe('/inventory');
    expect(safeNextPath('//evil.test')).toBe('/');
    expect(safeNextPath('https://evil.test')).toBe('/');
    expect(safeNextPath(undefined)).toBe('/');
  });
});
