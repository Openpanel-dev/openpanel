import crypto from 'node:crypto';
import { createTOTPKeyURI, verifyTOTPWithGracePeriod } from '@oslojs/otp';
import {
  decodeBase32,
  encodeBase32NoPadding,
} from '@oslojs/encoding';
import qrcode from 'qrcode';
import { hashPassword, verifyPasswordHash } from './password';

const ISSUER = 'OpenPanel';
const PERIOD_SECONDS = 30;
const DIGITS = 6;
// ±30s grace — tolerates small clock drift between the server and the user's device
const GRACE_PERIOD_SECONDS = 30;

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32NoPadding(bytes);
}

export function buildOtpauthUrl({
  secret,
  accountName,
}: {
  secret: string;
  accountName: string;
}): string {
  const key = decodeBase32(secret);
  return createTOTPKeyURI(ISSUER, accountName, key, PERIOD_SECONDS, DIGITS);
}

export async function generateQrDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }
  const key = decodeBase32(secret);
  return verifyTOTPWithGracePeriod(
    key,
    PERIOD_SECONDS,
    DIGITS,
    normalized,
    GRACE_PERIOD_SECONDS,
  );
}

// Human-friendly 10-char code split with a dash: `ABCDE-FGHIJ`.
// ~51 bits of entropy; argon2-hashed for storage.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomRecoveryCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += RECOVERY_ALPHABET[bytes[i]! % RECOVERY_ALPHABET.length];
    if (i === 4) {
      out += '-';
    }
  }
  return out;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, randomRecoveryCode);
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashPassword(normalizeRecoveryCode(code))));
}

export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export async function consumeRecoveryCode({
  hashes,
  input,
}: {
  hashes: string[];
  input: string;
}): Promise<{ valid: boolean; remaining: string[] }> {
  const normalized = normalizeRecoveryCode(input);
  for (let i = 0; i < hashes.length; i++) {
    const hash = hashes[i]!;
    // Sequential verify is fine — argon2 is slow on purpose and the list is 10 entries.
    const matched = await verifyPasswordHash(hash, normalized);
    if (matched) {
      const remaining = hashes.slice(0, i).concat(hashes.slice(i + 1));
      return { valid: true, remaining };
    }
  }
  return { valid: false, remaining: hashes };
}
