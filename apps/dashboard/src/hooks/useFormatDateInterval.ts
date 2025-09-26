import type { IInterval } from '@openpanel/validation';

export function formatDateInterval(interval: IInterval, date: Date): string {
  try {
    if (interval === 'hour' || interval === 'minute') {
      return new Intl.DateTimeFormat('en-GB', {
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

export function useFormatDateInterval(interval: IInterval) {
  return (date: Date | string) =>
    formatDateInterval(
      interval,
      typeof date === 'string' ? new Date(date) : date,
    );
}
