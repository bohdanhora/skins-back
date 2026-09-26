export const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})$/;
const VALID = /^is_valid\s*:\s*true$/m;

export type OpenIdParams = Record<string, unknown>;

export const safeNextPath = (next: unknown): string =>
  typeof next === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) && next.length <= 200
    ? next
    : '/';

export const returnUrl = (publicApiUrl: string, next: string): string =>
  `${publicApiUrl}/api/auth/steam/return?next=${encodeURIComponent(safeNextPath(next))}`;

export const loginUrl = (publicApiUrl: string, next: string): string => {
  const params = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl(publicApiUrl, next),
    'openid.realm': publicApiUrl,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });

  return `${STEAM_OPENID_URL}?${params.toString()}`;
};

const text = (params: OpenIdParams, key: string): string | null => {
  const value = params[key];

  return typeof value === 'string' ? value : null;
};

export const claimedSteamId = (params: OpenIdParams, publicApiUrl: string): string | null => {
  if (
    text(params, 'openid.mode') !== 'id_res' ||
    text(params, 'openid.op_endpoint') !== STEAM_OPENID_URL ||
    !text(params, 'openid.return_to')?.startsWith(`${publicApiUrl}/api/auth/steam/return`)
  ) {
    return null;
  }

  const claimed = text(params, 'openid.claimed_id');
  const match = claimed?.match(CLAIMED_ID);

  return match && text(params, 'openid.identity') === claimed ? match[1] : null;
};

export const verificationBody = (params: OpenIdParams): URLSearchParams => {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('openid.') && typeof value === 'string') {
      body.set(key, value);
    }
  }

  body.set('openid.mode', 'check_authentication');

  return body;
};

export const isValidAssertion = (response: string): boolean => VALID.test(response);
