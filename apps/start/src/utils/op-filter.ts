import type { TrackHandlerPayload } from '@openpanel/web';

// These pages carry a credential (reset token, unsubscribe token) in the URL.
const PATHS_WITH_URL_CREDENTIALS = new Set(['/reset-password', '/unsubscribe']);

const URL_PROPERTIES = ['__path', '__referrer'] as const;

function pointsAtCredentialPage(url: unknown): boolean {
  if (typeof url !== 'string' || url === '') {
    return false;
  }
  try {
    const { pathname } = new URL(url, window.location.origin);
    return PATHS_WITH_URL_CREDENTIALS.has(pathname);
  } catch {
    return false;
  }
}

/** Drops any event that would send a credential-bearing URL to analytics. */
export function shouldSendAnalyticsEvent(event: TrackHandlerPayload): boolean {
  const onCredentialPage = pointsAtCredentialPage(window.location.href);
  if (onCredentialPage) {
    return false;
  }
  const properties: Record<string, unknown> =
    'properties' in event.payload && event.payload.properties
      ? event.payload.properties
      : {};
  return !URL_PROPERTIES.some((key) => pointsAtCredentialPage(properties[key]));
}
