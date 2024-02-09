import { round } from '@/utils/math';

export function getYAxisWidth(value: number) {
  if (!isFinite(value)) {
    return 7.8 + 7.8;
  }

  return round(value, 0).toString().length * 7.8 + 7.8;
}
