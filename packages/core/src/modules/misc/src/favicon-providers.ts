// The icon services the favicon proxy asks, and the only hosts it will
// connect to. Google answers with a redirect to `t{n}.gstatic.com`, so that
// domain is allowed too; a redirect anywhere else is not followed.

import { type SafeFetchResult, safeFetch } from '@openpanel/shared/server';
import type { Logger } from '../../../logger';
import { contentTypeFor, detectImageFormat } from './image-format';

const PROVIDER_HOSTS = new Set(['icons.duckduckgo.com', 'www.google.com']);
const PROVIDER_REDIRECT_DOMAIN = '.gstatic.com';
const MAX_PROVIDER_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_ICON_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const FAVICON_USER_AGENT =
  'OpenPanel-FaviconProxy/1.0 (+https://openpanel.dev)';

export const FAVICON_PROVIDERS: readonly ((hostname: string) => URL)[] = [
  (hostname) => new URL(`https://icons.duckduckgo.com/ip3/${hostname}.ico`),
  (hostname) =>
    new URL(`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`),
];

export interface ProviderIcon {
  buffer: Buffer;
  contentType: string;
}

/** One hop: a 3xx is returned, not followed, so the walk below can vet it. */
export type FetchHop = (
  url: URL,
  signal?: AbortSignal
) => Promise<SafeFetchResult>;

export interface FetchProviderIconOptions {
  logger?: Pick<Logger, 'debug' | 'warn'>;
  /** One deadline for every hop and provider of a lookup. */
  signal?: AbortSignal;
  fetch?: FetchHop;
}

export function isAllowedProviderUrl(url: URL): boolean {
  if (url.protocol !== 'https:') {
    return false;
  }
  return (
    PROVIDER_HOSTS.has(url.hostname) ||
    url.hostname.endsWith(PROVIDER_REDIRECT_DOMAIN)
  );
}

function fetchHop(url: URL, signal?: AbortSignal): Promise<SafeFetchResult> {
  return safeFetch(url, {
    followRedirects: false,
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_ICON_BYTES,
    headers: { 'user-agent': FAVICON_USER_AGENT, accept: 'image/*' },
    signal,
  });
}

/**
 * The icon a provider answers with, or `null`. Walks the redirects itself so
 * every hop is checked against the allowlist before it is connected to;
 * `safeFetch` still validates and pins each address.
 */
export async function fetchProviderIcon(
  providerUrl: URL,
  { logger, signal, fetch = fetchHop }: FetchProviderIconOptions = {}
): Promise<ProviderIcon | null> {
  let url = providerUrl;
  try {
    for (let hop = 0; hop <= MAX_PROVIDER_REDIRECTS; hop += 1) {
      if (!isAllowedProviderUrl(url)) {
        logger?.warn(
          { url: url.toString() },
          'Icon service redirected outside the allowed hosts'
        );
        return null;
      }
      const result = await fetch(url, signal);
      const location = result.headers.get('location');
      if (REDIRECT_STATUSES.has(result.status) && location) {
        url = new URL(location, url);
        continue;
      }
      if (result.status !== 200) {
        return null;
      }
      const format = detectImageFormat(result.body);
      if (!format) {
        logger?.debug(
          { url: url.toString() },
          'Icon service returned a non-image'
        );
        return null;
      }
      return { buffer: result.body, contentType: contentTypeFor(format) };
    }
    return null;
  } catch (error) {
    logger?.warn(
      { err: error, url: url.toString() },
      'Icon service fetch failed'
    );
    return null;
  }
}
