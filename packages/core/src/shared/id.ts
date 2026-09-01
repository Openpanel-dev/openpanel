// Ported from @openpanel/common's id.ts, unchanged. nanoid/non-secure is
// deliberate: these are correlation/display ids, not secrets.
import { nanoid } from 'nanoid/non-secure';

const SHORT_ID_LENGTH = 4;
const DEFAULT_ID_LENGTH = 8;

export function shortId(): string {
  return nanoid(SHORT_ID_LENGTH);
}

export function generateId(prefix?: string, length?: number): string {
  const id = nanoid(length ?? DEFAULT_ID_LENGTH);
  return prefix ? `${prefix}_${id}` : id;
}
