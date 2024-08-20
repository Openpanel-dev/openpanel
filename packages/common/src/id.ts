import { nanoid } from 'nanoid/non-secure';

export function shortId() {
  return nanoid(4);
}
