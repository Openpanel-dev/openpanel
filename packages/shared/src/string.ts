// Moved from packages/common/src/string.ts (ADR-007 shared/ layout).

export function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

export function stripLeadingAndTrailingSlashes(url: string) {
  return url.replace(/^[/]+|[/]+$/g, '');
}
