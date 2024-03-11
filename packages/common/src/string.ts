export function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}
