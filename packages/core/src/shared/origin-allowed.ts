// The browser-origin rule ingestion applies, shared with the tracking
// diagnosis so what the chat reports is what the API enforces.

const DOMAIN_PROTOCOL = /https?:\/\//;
const DOMAIN_TRAILING_SLASH = /\/$/;
const DOMAIN_PORT = /:\d+$/;
const WILDCARD = '*';

export const cleanDomain = (domain: string) =>
  domain
    .replace('www.', '')
    .replace(DOMAIN_PROTOCOL, '')
    .replace(DOMAIN_TRAILING_SLASH, '');

/**
 * `*` matches any run of characters and the whole host must match. Plain string
 * scans rather than a regex built from the stored pattern, so a pattern cannot
 * carry regex syntax or backtrack.
 */
function matchesWildcard(pattern: string, host: string): boolean {
  const parts = pattern.split(WILDCARD);
  const head = parts[0] ?? '';
  const tail = parts.at(-1) ?? '';
  if (!host.startsWith(head)) {
    return false;
  }
  let position = head.length;
  for (const part of parts.slice(1, -1)) {
    const index = host.indexOf(part, position);
    if (index === -1) {
      return false;
    }
    position = index + part.length;
  }
  return host.length - tail.length >= position && host.endsWith(tail);
}

/** `host[:port]` of a parseable origin, so a path or query cannot reach the wildcard match. */
function originHost(origin: string | undefined): string | undefined {
  const host = origin ? URL.parse(origin)?.host : undefined;
  return host ? cleanDomain(host) : undefined;
}

/** Whether `origin` matches the project's allowed origins (`*.foo.com` wildcards and `*` included). */
export function isOriginAllowed(
  cors: string[],
  origin: string | undefined
): boolean {
  const cleanedOrigin = cleanDomain(origin || '');
  const host = originHost(origin);
  const domainAllowed = cors.find((domain) => {
    const cleanedDomain = cleanDomain(domain);
    if (!cleanedDomain.includes(WILDCARD)) {
      return cleanedDomain === cleanedOrigin;
    }
    if (!host) {
      return false;
    }
    // A wildcard entry without a port allows any port, as `*.foo.com` always
    // has for a dev server on `app.foo.com:3000`.
    const comparedHost = cleanedDomain.includes(':')
      ? host
      : host.replace(DOMAIN_PORT, '');
    return matchesWildcard(cleanedDomain, comparedHost);
  });

  if (domainAllowed) {
    return true;
  }

  return cors.includes('*') && !!origin;
}
