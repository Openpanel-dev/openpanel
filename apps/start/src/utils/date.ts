import { differenceInDays, differenceInHours, isSameDay } from 'date-fns';
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
  const day = date.getDate();
  const month = new Intl.DateTimeFormat(getLocale(), { month: 'short' })
    .format(date)
    .replace('.', '')
    .toLowerCase();

  return `${day} ${month}`;
}

export function formatDateTime(date: Date) {
  const datePart = formatDate(date);
  const timePart = new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);

  return `${datePart}, ${timePart}`;
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(date);
}

TimeAgo.addDefaultLocale(en);
const ta = new TimeAgo(getLocale());

export function timeAgo(date: Date, style?: FormatStyleName) {
  return ta.format(new Date(date), style);
}

export function formatTimeAgoOrDateTime(date: Date) {
  if (Math.abs(differenceInHours(date, new Date())) < 3) {
    return timeAgo(date);
  }

  return isSameDay(date, new Date()) ? formatTime(date) : formatDateTime(date);
}

export function utc(date: string) {
  if (date.match(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}.\d{3}$/)) {
    return new Date(`${date}Z`);
  }
  return new Date(date).toISOString();
}
