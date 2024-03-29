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
  return new Intl.DateTimeFormat(getLocale()).format(date);
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
