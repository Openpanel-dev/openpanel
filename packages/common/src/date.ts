export { DateTime } from 'luxon';

export type { DateTime };

export function getTime(date: string | number | Date) {
  return new Date(date).getTime();
}
