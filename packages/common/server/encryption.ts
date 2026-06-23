import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ENCRYPTION_PREFIX = 'enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = 'base64';

/**
 * Single symmetric key for all at-rest encryption (TOTP secrets, GSC tokens,
 * integration credentials). Must be 32 bytes (64 hex characters).
 * Generate with: openssl rand -hex 32
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes (64 hex characters). Generate with: openssl rand -hex 32',
    );
  }

  return Buffer.from(keyHex, 'hex');
}

// ---------------------------------------------------------------------------
// Plain encrypt/decrypt — base64(iv + authTag + ciphertext), no prefix.
// Used for TOTP secrets and GSC tokens. (Kept format-stable so existing
// ciphertext keeps decrypting; this is the implementation db re-exports.)
// ---------------------------------------------------------------------------

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString(ENCODING);
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertext, ENCODING);
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// Credential variant — enc:base64(iv + ciphertext + authTag). The enc: prefix
// makes it idempotent (skip already-encrypted values) and lets a plaintext
// value pass through unchanged, which the integration test-connection flow
// relies on (it builds adapters from the raw, unsaved config).
// ---------------------------------------------------------------------------

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptCredential(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }
  // Don't double-encrypt
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Combine: IV (12 bytes) + ciphertext (variable) + authTag (16 bytes)
  const combined = Buffer.concat([iv, ciphertext, authTag]);

  return ENCRYPTION_PREFIX + combined.toString('base64');
}

export function decryptCredential(ciphertext: string): string {
  if (!ciphertext) {
    return ciphertext;
  }
  // If not encrypted, return as-is (allows for graceful migration)
  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  const key = getEncryptionKey();

  // Remove prefix and decode base64
  const combined = Buffer.from(
    ciphertext.slice(ENCRYPTION_PREFIX.length),
    'base64',
  );

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted credential: too short');
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
