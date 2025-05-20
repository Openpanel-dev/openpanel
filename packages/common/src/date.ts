import { DateTime } from 'luxon';

export { DateTime };

export function getTime(date: string | number | Date) {
  return new Date(date).getTime();
}
