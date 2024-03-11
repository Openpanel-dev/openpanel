export function getTime(date: string | number | Date) {
  return new Date(date).getTime();
}

export function toISOString(date: string | number | Date) {
  return new Date(date).toISOString();
}
