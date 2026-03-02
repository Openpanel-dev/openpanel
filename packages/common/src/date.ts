// biome-ignore lint/performance/noBarrelFile: lazy
export { DateTime } from 'luxon';

export function getTime(date: string | number | Date) {
  return new Date(date).getTime();
}
