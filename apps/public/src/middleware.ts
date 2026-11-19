import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Read by the dashboard when a workspace is created; the key names are its
// contract (`zOrganizationAttribution` in the onboarding constants). Set
// server-side so every browser gets it, including those without the Cookie
// Store API.
const ATTRIBUTION_COOKIE_NAME = 'op_attribution';
const ATTRIBUTION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const ATTRIBUTION_COOKIE_DOMAIN = 'openpanel.dev';
const UTM_KEYS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
} as const;

function isOwnHost(hostname: string, requestHost: string) {
  return (
    hostname === requestHost ||
    hostname === ATTRIBUTION_COOKIE_DOMAIN ||
    hostname.endsWith(`.${ATTRIBUTION_COOKIE_DOMAIN}`)
  );
}

// A referrer's query string can carry the referring site's own tokens and
// adds nothing to attribution. A referrer on our own domain (any subdomain,
// the dashboard included) is navigation, not a source.
function externalReferrer(referer: string | null, requestHost: string) {
  if (!referer) {
    return undefined;
  }
  try {
    const parsed = new URL(referer);
    if (isOwnHost(parsed.hostname, requestHost)) {
      return undefined;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

function readFirstTouch(request: NextRequest) {
  const { pathname, searchParams, hostname } = request.nextUrl;
  const value: Record<string, string> = {
    landingPage: pathname,
    firstSeenAt: new Date().toISOString(),
  };
  const referrer = externalReferrer(request.headers.get('referer'), hostname);
  if (referrer) {
    value.referrer = referrer;
  }
  for (const [param, key] of Object.entries(UTM_KEYS)) {
    const utm = searchParams.get(param);
    if (utm) {
      value[key] = utm;
    }
  }
  return value;
}

/**
 * Remembers the first visit to openpanel.dev (referrer, landing page, UTM) in
 * a cookie shared with the dashboard, so a sign-up days later can still be
 * traced back to the channel that brought it. Later visits never overwrite it.
 */
function rememberFirstTouch(request: NextRequest, response: NextResponse) {
  if (request.cookies.has(ATTRIBUTION_COOKIE_NAME)) {
    return;
  }
  const { hostname, protocol } = request.nextUrl;
  const isProductionHost = hostname.endsWith(ATTRIBUTION_COOKIE_DOMAIN);
  // Next URL-encodes the value itself; the dashboard decodes it once.
  response.cookies.set({
    name: ATTRIBUTION_COOKIE_NAME,
    value: JSON.stringify(readFirstTouch(request)),
    maxAge: ATTRIBUTION_MAX_AGE_SECONDS,
    path: '/',
    domain: isProductionHost ? ATTRIBUTION_COOKIE_DOMAIN : undefined,
    sameSite: 'lax',
    secure: protocol === 'https:',
    httpOnly: false,
  });
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.endsWith('.md')) {
    const url = request.nextUrl.clone();
    url.pathname = '/md';
    url.searchParams.set('path', pathname.slice(0, -3));
    return NextResponse.rewrite(url);
  }
  const response = NextResponse.next();
  rememberFirstTouch(request, response);
  return response;
}

export const config = {
  matcher: [
    // Pages: everything without a file extension, except Next internals.
    '/((?!_next|api|favicon|robots|sitemap|og|.*\\.[a-zA-Z0-9]+$).*)',
    '/((?!_next|api|favicon|robots|sitemap|og).*\\.md)',
  ],
};
