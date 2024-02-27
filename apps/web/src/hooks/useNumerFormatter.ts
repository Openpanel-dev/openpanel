import { round } from '@/utils/math';
import { isNil } from 'ramda';

export function fancyMinutes(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = round(time - minutes * 60, 0);
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
  };
}
