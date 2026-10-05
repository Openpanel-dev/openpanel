// The browser holds `token`, Postgres stores only its hash, so a leaked
// `sessions` row is not a leaked cookie. `hashSessionToken` is the single source
// of that hash so @openpanel/db's session CRUD (which cannot live here without
// a core -> db cycle) and this package's token issuance agree on the session id.

import crypto from 'node:crypto';
import { sha256 } from '@oslojs/crypto/sha2';
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from '@oslojs/encoding';

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashSessionToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export function decodeSessionToken(token: string): string | null {
  return token ? hashSessionToken(token) : null;
}
