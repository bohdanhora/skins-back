import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SEED_BYTES = 32;

export interface SignedHeaders {
  'X-Api-Key': string;
  'X-Sign-Date': string;
  'X-Request-Sign': string;
}

export class DmarketSigner {
  private readonly key: KeyObject;

  constructor(
    private readonly publicKey: string,
    secretKeyHex: string,
  ) {
    const seed = Buffer.from(secretKeyHex, 'hex').subarray(0, SEED_BYTES);

    if (seed.length !== SEED_BYTES) {
      throw new Error('DMARKET_SECRET_KEY must be a hex string of at least 32 bytes');
    }

    this.key = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
      format: 'der',
      type: 'pkcs8',
    });
  }

  sign(method: string, pathWithQuery: string, body = '', now = Date.now()): SignedHeaders {
    const timestamp = Math.floor(now / 1000).toString();
    const message = `${method}${pathWithQuery}${body}${timestamp}`;
    const signature = sign(null, Buffer.from(message, 'utf8'), this.key).toString('hex');

    return {
      'X-Api-Key': this.publicKey,
      'X-Sign-Date': timestamp,
      'X-Request-Sign': `dmar ed25519 ${signature}`,
    };
  }
}
