export function truncate(
  str: string,
  len: number,
  mode: 'start' | 'end' | 'middle' = 'end',
) {
  if (str.length <= len) {
    return str;
  }
  if (mode === 'start') {
    return `...${str.slice(-len)}`;
  }
  if (mode === 'middle') {
    return `${str.slice(0, len / 2)}...${str.slice(-len / 2)}`;
  }
  return `${str.slice(0, len)}...`;
}
