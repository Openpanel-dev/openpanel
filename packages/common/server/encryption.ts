import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const ENCRYPTION_PREFIX = 'enc:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment variable
 * Key must be 32 bytes (64 hex characters)
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY environment variable is required for credential encryption. ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  if (keyHex.length !== 64) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (64 hex characters). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Check if a value is already encrypted (has the enc: prefix)
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypt a credential using AES-256-GCM
 * Returns: enc:<base64(iv + ciphertext + authTag)>
 */
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

/**
 * Decrypt a credential that was encrypted with encryptCredential
 * Expects: enc:<base64(iv + ciphertext + authTag)>
 */
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
    'base64'
  );
  
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted credential: too short');
  }
  
  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encryptedData = combined.subarray(
    IV_LENGTH,
    combined.length - AUTH_TAG_LENGTH
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
