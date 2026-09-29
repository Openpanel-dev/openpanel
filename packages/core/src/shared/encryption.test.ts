// Subject moved to @openpanel/shared; the suite did not follow it. Nothing runs
// a `test` script in packages/shared yet — the root `test` script names its
// four workspaces explicitly and hasn't picked up the new one — so moving this
// file would take it out of every gate. Move it when that line can gain the
// filter.
import { describe, expect, it } from 'bun:test';
import {
  decrypt,
  decryptCredential,
  encrypt,
  encryptCredential,
  isEncrypted,
} from '@openpanel/shared/server';

// Deterministic key for the round-trips — the value the config loader would
// hand down as `config.encryptionKey`.
const KEY = 'a'.repeat(64);

describe('encryption (single ENCRYPTION_KEY)', () => {
  it('encrypt/decrypt round-trips without a prefix (TOTP/GSC format)', () => {
    const secret = 'totp-or-gsc-secret';
    const enc = encrypt(KEY, secret);
    expect(isEncrypted(enc)).toBe(false);
    expect(enc).not.toBe(secret);
    expect(decrypt(KEY, enc)).toBe(secret);
  });

  it('encryptCredential/decryptCredential round-trips with the enc: prefix', () => {
    const secret = 'aws-secret-access-key';
    const enc = encryptCredential(KEY, secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptCredential(KEY, enc)).toBe(secret);
  });

  it('encryptCredential is idempotent (never double-encrypts)', () => {
    const enc = encryptCredential(KEY, 'x');
    expect(encryptCredential(KEY, enc)).toBe(enc);
  });

  it('decryptCredential passes plaintext through (test-connection flow)', () => {
    expect(decryptCredential(KEY, 'plaintext')).toBe('plaintext');
  });

  it('decrypt round-trips multi-byte UTF-8 across cipher chunk boundaries', () => {
    // GCM is a stream cipher: update() can return a chunk ending mid-character,
    // so decoding per chunk instead of after concatenation corrupts the value.
    const secret = `${'ä'.repeat(500)}🔐日本語`;
    expect(decrypt(KEY, encrypt(KEY, secret))).toBe(secret);
    expect(decryptCredential(KEY, encryptCredential(KEY, secret))).toBe(secret);
  });

  it('decrypt throws a guarded error for a too-short/malformed ciphertext', () => {
    // Shorter than IV_LENGTH + AUTH_TAG_LENGTH: the tag slice comes back
    // empty. Bun's setAuthTag validates the length up front and throws a
    // bare TypeError before this guard existed; the guard normalizes that
    // to the same descriptive error on both runtimes.
    const tooShort = Buffer.from('short').toString('base64');
    expect(() => decrypt(KEY, tooShort)).toThrow(
      'Invalid encrypted value: expected a 16-byte auth tag, got 0'
    );
    expect(() => decrypt(KEY, '')).toThrow(
      'Invalid encrypted value: expected a 16-byte auth tag, got 0'
    );
  });
});
