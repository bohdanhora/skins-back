import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VISIBLE_PREFIX = 3;
const VISIBLE_SUFFIX = 4;
const MIN_MASKABLE_LENGTH = VISIBLE_PREFIX + VISIBLE_SUFFIX + 1;

export interface EncryptedSecret {
  cipher: string;
  iv: string;
  tag: string;
}

export const deriveEncryptionKey = (secret: string): Buffer =>
  createHash('sha256').update(secret, 'utf8').digest();

export const encryptSecret = (plainText: string, key: Buffer): EncryptedSecret => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

  return {
    cipher: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
};

export const decryptSecret = (secret: EncryptedSecret, key: Buffer): string => {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(secret.iv, 'base64'));

  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(secret.cipher, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

export const maskSecret = (value: string): string => {
  if (value.length < MIN_MASKABLE_LENGTH) {
    return '***';
  }

  return `${value.slice(0, VISIBLE_PREFIX)}...${value.slice(-VISIBLE_SUFFIX)}`;
};
