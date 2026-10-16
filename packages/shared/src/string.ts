export function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

export function stripLeadingAndTrailingSlashes(url: string) {
  return url.replace(/^[/]+|[/]+$/g, '');
}
