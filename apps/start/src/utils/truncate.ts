export function truncate(str: string, len: number) {
  if (str.length <= len) {
    return str;
  }
  return `${str.slice(0, len)}...`;
}
