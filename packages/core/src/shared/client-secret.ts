import { verify as verifyArgon2 } from '@node-rs/argon2';
import {
  hashPassword as hashScrypt,
  verifyPassword as verifyScrypt,
} from '@openpanel/shared/server';

const ARGON2_PREFIX = '$argon2';

/** Client secrets are scrypt (`salt.hash`), the format V1 and the seed write. */
export function hashClientSecret(secret: string): Promise<string> {
  return hashScrypt(secret);
}

/**
 * Reads both formats: scrypt, and the argon2 rows the ported client, project
 * and onboarding services minted while they imported the user-password hasher
 * by mistake. A malformed stored hash is a failed verification, never a 500 on
 * the ingest path.
 */
export async function verifyClientSecret(
  secret: string,
  storedHash: string
): Promise<boolean> {
  try {
    if (storedHash.startsWith(ARGON2_PREFIX)) {
      return await verifyArgon2(storedHash, secret);
    }
    return await verifyScrypt(secret, storedHash);
  } catch {
    return false;
  }
}
