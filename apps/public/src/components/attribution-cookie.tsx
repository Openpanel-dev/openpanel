'use client';

import { useEffect } from 'react';

// Read by the dashboard when a workspace is created; the key names are its
// contract (`zOrganizationAttribution` in the onboarding constants).
const COOKIE_NAME = 'op_attribution';
const COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const COOKIE_DOMAIN = 'openpanel.dev';
const UTM_KEYS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
} as const;

function readFirstTouch() {
  const params = new URLSearchParams(window.location.search);
  const value: Record<string, string> = {
    landingPage: window.location.pathname,
    firstSeenAt: new Date().toISOString(),
  };
  if (document.referrer) {
    value.referrer = document.referrer;
  }
  for (const [param, key] of Object.entries(UTM_KEYS)) {
    const utm = params.get(param);
    if (utm) {
      value[key] = utm;
    }
  }
  return value;
}

async function rememberFirstTouch() {
  if (await cookieStore.get(COOKIE_NAME)) {
    return;
  }
  const isProductionHost = window.location.hostname.endsWith(COOKIE_DOMAIN);
  await cookieStore.set({
    name: COOKIE_NAME,
    value: encodeURIComponent(JSON.stringify(readFirstTouch())),
    expires: Date.now() + COOKIE_MAX_AGE_MS,
    path: '/',
    domain: isProductionHost ? COOKIE_DOMAIN : null,
    sameSite: 'lax',
  });
}

/**
 * Remembers the first visit to openpanel.dev (referrer, landing page, UTM) in
 * a cookie shared with the dashboard, so a sign-up days later can still be
 * traced back to the channel that brought it. Browsers without the Cookie
 * Store API are left unattributed.
 */
export function AttributionCookie() {
  useEffect(() => {
    if (!('cookieStore' in window)) {
      return;
    }
    rememberFirstTouch().catch(() => undefined);
  }, []);

  return null;
}
