import { beforeAll, describe, expect, it } from 'vitest';
import {
  decrypt,
  decryptCredential,
  encrypt,
  encryptCredential,
  isEncrypted,
} from './encryption';

beforeAll(() => {
  // Deterministic key for the round-trips (overrides any ambient value).
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('encryption (single ENCRYPTION_KEY)', () => {
  it('encrypt/decrypt round-trips without a prefix (TOTP/GSC format)', () => {
    const secret = 'totp-or-gsc-secret';
    const enc = encrypt(secret);
    expect(isEncrypted(enc)).toBe(false);
    expect(enc).not.toBe(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it('encryptCredential/decryptCredential round-trips with the enc: prefix', () => {
    const secret = 'aws-secret-access-key';
    const enc = encryptCredential(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptCredential(enc)).toBe(secret);
  });

  it('encryptCredential is idempotent (never double-encrypts)', () => {
    const enc = encryptCredential('x');
    expect(encryptCredential(enc)).toBe(enc);
  });

  it('decryptCredential passes plaintext through (test-connection flow)', () => {
    expect(decryptCredential('plaintext')).toBe('plaintext');
  });

  it('decrypt round-trips multi-byte UTF-8 across cipher chunk boundaries', () => {
    // GCM is a stream cipher: update() can return a chunk ending mid-character,
    // so decoding per chunk instead of after concatenation corrupts the value.
    const secret = `${'ä'.repeat(500)}🔐日本語`;
    expect(decrypt(encrypt(secret))).toBe(secret);
    expect(decryptCredential(encryptCredential(secret))).toBe(secret);
  });
});
