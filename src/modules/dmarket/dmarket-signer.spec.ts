import { createPublicKey, verify } from 'node:crypto';

import { DmarketSigner } from './dmarket-signer';

/** RFC 8032 test vector 1: seed and its public key. */
const SEED = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

describe('DmarketSigner', () => {
  it('signs method, path, body and timestamp with the seed half of the NaCl key', () => {
    const signer = new DmarketSigner(PUBLIC, SEED + PUBLIC);
    const headers = signer.sign('GET', '/account/v1/balance', '', 1_605_619_994_000);

    expect(headers['X-Api-Key']).toBe(PUBLIC);
    expect(headers['X-Sign-Date']).toBe('1605619994');
    expect(headers['X-Request-Sign']).toMatch(/^dmar ed25519 [0-9a-f]{128}$/);

    const publicKey = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(PUBLIC, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    const signature = Buffer.from(headers['X-Request-Sign'].split(' ')[2], 'hex');

    expect(
      verify(null, Buffer.from('GET/account/v1/balance1605619994'), publicKey, signature),
    ).toBe(true);
  });

  it('rejects a key that is too short', () => {
    expect(() => new DmarketSigner(PUBLIC, 'abcd')).toThrow('DMARKET_SECRET_KEY');
  });
});
