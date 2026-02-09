import { nanoid } from 'nanoid/non-secure';

export function shortId() {
  return nanoid(4);
}

export function generateId(prefix?: string, length?: number) {
  return prefix ? `${prefix}_${nanoid(length ?? 8)}` : nanoid(length ?? 8);
}
