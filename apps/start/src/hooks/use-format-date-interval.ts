import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import { getISOWeek } from 'date-fns';
import { useTranslation } from '@/i18n/provider';

export function formatDateInterval(options: {
  interval: IInterval;
  date: Date;
  short: boolean;
  locale?: string;
}): string {
  const { interval, date, short, locale = 'en-GB' } = options;
  try {
    if (interval === 'hour' || interval === 'minute') {
      if (short) {
        return new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
      }
      return new Intl.DateTimeFormat(locale, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }

    if (interval === 'month') {
      return new Intl.DateTimeFormat(locale, { month: 'short' }).format(date);
    }

    if (interval === 'week') {
      if (short) {
        return `W${getISOWeek(date)}`;
      }
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }

    if (interval === 'day') {
      if (short) {
        return new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
        }).format(date);
      }
      return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }

    return date.toISOString();
  } catch {
    return '';
  }
}

export function useFormatDateInterval(options: {
  interval: IInterval;
  short: boolean;
}) {
  const { language } = useTranslation();
  return (date: Date | string) =>
    formatDateInterval({
      ...options,
      locale: language,
      date: typeof date === 'string' ? new Date(date) : date,
    });
}
