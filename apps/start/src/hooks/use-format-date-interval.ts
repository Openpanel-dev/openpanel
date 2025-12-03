import type { IInterval } from '@openpanel/validation';

export function formatDateInterval(options: {
  interval: IInterval;
  date: Date;
  short: boolean;
}): string {
  const { interval, date, short } = options;
  try {
    if (interval === 'hour' || interval === 'minute') {
      return new Intl.DateTimeFormat('en-GB', {
        ...(!short
          ? {
              month: '2-digit',
              day: '2-digit',
            }
          : {}),
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    if (interval === 'month') {
      return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
    }

    if (interval === 'week') {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }

    if (interval === 'day') {
      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(date);
    }

    return date.toISOString();
  } catch (e) {
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
