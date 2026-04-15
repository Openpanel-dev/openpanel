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

/**
 * Shorter variant used in places where space is tight (e.g. the profile
 * summary metric cards). Produces e.g. "25 mins ago" instead of
 * "25 minutes ago", "2 mos ago" instead of "2 months ago".
 *
 * We don't rely on javascript-time-ago's `short` style alone — different
 * locale bundles format the short style differently (some produce
 * "5 min. ago", others still "5 minutes ago"). The post-processing
 * below normalises both possibilities to a consistent terse output.
 */
export function timeAgoShort(date: Date) {
  return ta
    .format(new Date(date), 'short')
    // Long forms → short forms.
    .replace(/\bseconds?\b/g, 'secs')
    .replace(/\bminutes?\b/g, 'mins')
    .replace(/\bhours?\b/g, 'hrs')
    .replace(/\bmonths?\b/g, 'mos')
    .replace(/\byears?\b/g, 'yrs')
    // Any "short" form that already abbreviates with a trailing period
    // (library-locale-dependent) gets the period stripped.
    .replace(/\bsec\./g, 'secs')
    .replace(/\bmin\./g, 'mins')
    .replace(/\bhr\./g, 'hrs')
    .replace(/\bmo\./g, 'mos')
    .replace(/\byr\./g, 'yrs')
    // "1 mins" / "1 hrs" reads weird; drop the pluralising s after 1.
    .replace(/\b1 (secs|mins|hrs|mos|yrs)\b/g, (_, unit) =>
      `1 ${unit.slice(0, -1)}`,
    );
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
