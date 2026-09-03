// Ported from @openpanel/common's id.ts, unchanged. nanoid/non-secure is
// deliberate: these are correlation/display ids, not secrets.

// Ported from @openpanel/common/server's id.ts (M4-003). Regular `nanoid`,
// not the non-secure variant above: these ids back password-reset tokens and
// invite links, so they must stay cryptographically random.
import { nanoid as secureNanoid } from 'nanoid';
import { nanoid } from 'nanoid/non-secure';

const SHORT_ID_LENGTH = 4;
const DEFAULT_ID_LENGTH = 8;
const SECURE_ID_LENGTH = 18;

export function shortId(): string {
  return nanoid(SHORT_ID_LENGTH);
}

export function generateId(prefix?: string, length?: number): string {
  const id = nanoid(length ?? DEFAULT_ID_LENGTH);
  return prefix ? `${prefix}_${id}` : id;
}

export function generateSecureId(prefix: string): string {
  return `${prefix}_${secureNanoid(SECURE_ID_LENGTH)}`;
}
