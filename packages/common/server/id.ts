import { nanoid } from 'nanoid';

export function generateSecureId(prefix: string) {
  return `${prefix}_${nanoid(18)}`;
}
