import { round } from '@/utils/math';
import { isNil } from 'ramda';

export function fancyMinutes(time: number) {
  const minutes = Math.floor(time / 60);
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  const seconds = round(time - minutes * 60, 0);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export const formatNumber =
  (locale: string) => (value: number | null | undefined) => {
    if (isNil(value)) {
      return 'N/A';
    }
    return new Intl.NumberFormat(locale).format(value);
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

export const formatCurrency =
  (locale: string) =>
  (
    amount: number,
    options?: {
      currency?: string;
      short?: boolean;
    },
  ) => {
    const short = options?.short ?? false;
    const currency = options?.currency ?? 'USD';
    if (short) {
      // Use compact notation for short format (e.g., "73K $")
      const formatter = new Intl.NumberFormat(locale, {
        notation: 'compact',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      const formatted = formatter.format(amount);
      // Get currency symbol
      const currencyFormatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      const parts = currencyFormatter.formatToParts(0);
      const symbol =
        parts.find((part) => part.type === 'currency')?.value || '$';
      return `${formatted} ${symbol}`;
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount);
  };

export function useNumber() {
  const locale = 'en-US';
  const format = formatNumber(locale);
  const short = shortNumber(locale);
  const currency = formatCurrency(locale);

  return {
    currency,
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
      if (unit === '%') {
        return `${format(round(value * 100, 1))}${unit ? ` ${unit}` : ''}`;
      }
      return `${format(value)}${unit ? ` ${unit}` : ''}`;
    },
  };
}
