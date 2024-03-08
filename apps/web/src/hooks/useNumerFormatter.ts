import { round } from '@/utils/math';
import { isNil } from 'ramda';

export function fancyMinutes(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = round(time - minutes * 60, 0);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function useNumber() {
  const locale = 'en-gb';

  const format = (value: number | null | undefined) => {
    if (isNil(value)) {
      return 'N/A';
    }
    return new Intl.NumberFormat(locale, {
      maximumSignificantDigits: 20,
    }).format(value);
  };
  const short = (value: number | null | undefined) => {
    if (isNil(value)) {
      return 'N/A';
    }
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
    }).format(value);
  };

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
      unit?: string | null
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
