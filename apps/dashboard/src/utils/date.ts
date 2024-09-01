import { isSameYear } from 'date-fns';
import type { FormatStyleName } from 'javascript-time-ago';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

export function dateDifferanceInDays(date1: Date, date2: Date) {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getLocale() {
  if (typeof navigator === 'undefined') {
    return 'en-US';
  }

  return navigator.language ?? 'en-US';
}

export function formatDate(date: Date) {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'numeric',
  };

  if (!isSameYear(date, new Date())) {
    options.year = 'numeric';
  }

  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}

TimeAgo.addDefaultLocale(en);
const ta = new TimeAgo(getLocale());

export function timeAgo(date: Date, style?: FormatStyleName) {
  return ta.format(new Date(date), style);
}

export function utc(date: string) {
  if (date.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}.\d{3}$/)) {
    return new Date(`${date}Z`);
  }
  return new Date(date).toISOString();
}
