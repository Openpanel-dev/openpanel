// The browser-origin rule ingestion applies, shared with the tracking
// diagnosis so what the chat reports is what the API enforces.

const DOMAIN_PROTOCOL = /https?:\/\//;
const DOMAIN_TRAILING_SLASH = /\/$/;
const DOMAIN_DOT = /\./g;
const DOMAIN_WILDCARD = /\*/g;

export const cleanDomain = (domain: string) =>
  domain
    .replace('www.', '')
    .replace(DOMAIN_PROTOCOL, '')
    .replace(DOMAIN_TRAILING_SLASH, '');

/** Whether `origin` matches the project's allowed origins (`*.foo.com` wildcards and `*` included). */
export function isOriginAllowed(
  cors: string[],
  origin: string | undefined
): boolean {
  const domainAllowed = cors.find((domain) => {
    const cleanedDomain = cleanDomain(domain);
    if (cleanedDomain.includes('*')) {
      const regex = new RegExp(
        `${cleanedDomain.replace(DOMAIN_DOT, '\\.').replace(DOMAIN_WILDCARD, '.+?')}`
      );
      return regex.test(origin || '');
    }
    return cleanedDomain === cleanDomain(origin || '');
  });

  if (domainAllowed) {
    return true;
  }

  return cors.includes('*') && !!origin;
}
