import { getISOWeek } from 'date-fns';

import type { IInterval } from '@openpanel/validation';

export function formatDateInterval(options: {
  interval: IInterval;
  date: Date;
  short: boolean;
}): string {
  const { interval, date, short } = options;
  try {
    if (interval === 'hour' || interval === 'minute') {
      if (short) {
        return new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(date);
      }
      return new Intl.DateTimeFormat('en-GB', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    }

    if (interval === 'month') {
      return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
    }

    if (interval === 'week') {
      if (short) {
        return `W${getISOWeek(date)}`;
      }
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }

    if (interval === 'day') {
      if (short) {
        return new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
        }).format(date);
      }
      return new Intl.DateTimeFormat('en-GB', {
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
  return (date: Date | string) =>
    formatDateInterval({
      ...options,
      date: typeof date === 'string' ? new Date(date) : date,
    });
}
