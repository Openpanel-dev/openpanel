import { round } from '@/utils/math';
import { isNil } from 'ramda';

export function fancyMinutes(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = round(time - minutes * 60, 0);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export const formatNumber =
  (locale: string) => (value: number | null | undefined) => {
    if (isNil(value)) {
      return 'N/A';
    }
    return new Intl.NumberFormat(locale, {
      maximumSignificantDigits: 3,
    }).format(value);
  };

export const shortNumber =
  (locale: string) => (value: number | null | undefined) => {
    if (isNil(value)) {
      return 'N/A';
    }
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
    }).format(value);
  };

export function useNumber() {
  const locale = 'en-gb';
  const format = formatNumber(locale);
  const short = shortNumber(locale);
  return {
    format,
    short,
    shortWithUnit: (value: number | null | undefined, unit?: string | null) => {
      if (isNil(value)) {
        return 'N/A';
      }
      if (unit === 'min') {
        return fancyMinutes(value);
      }
      return `${short(value)}${unit ? ` ${unit}` : ''}`;
    },
    formatWithUnit: (
      value: number | null | undefined,
      unit?: string | null,
    ) => {
      if (isNil(value)) {
        return 'N/A';
      }
      if (unit === 'min') {
        return fancyMinutes(value);
      }
      return `${format(value)}${unit ? ` ${unit}` : ''}`;
    },
  };
}
