export function getTime(date: string | number) {
  return new Date(date).getTime();
}

export function toISOString(date: string | number) {
  return new Date(date).toISOString();
}
