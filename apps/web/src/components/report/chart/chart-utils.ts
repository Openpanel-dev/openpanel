import { round } from '@/utils/math';

export function getYAxisWidth(value: number) {
  return round(value, 0).toString().length * 7.5 + 7.5;
}
