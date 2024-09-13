import { nanoid } from 'nanoid/non-secure';

export function shortId() {
  return nanoid(4);
}

export function generateId() {
  return nanoid(8);
}
