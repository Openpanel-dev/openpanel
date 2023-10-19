export function getDaysOldDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function dateDifferanceInDays(date1: Date, date2: Date) {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
}