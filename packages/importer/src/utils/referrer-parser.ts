import { stripTrailingSlash } from '@openpanel/common';

// Simplified referrer database - we'll use the same logic as the main app
// but with a smaller subset for the importer to avoid circular dependencies
const referrers: Record<string, { type: string; name: string }> = {
  // Search engines
  'google.com': { type: 'search', name: 'Google' },
  'www.google.com': { type: 'search', name: 'Google' },
  'bing.com': { type: 'search', name: 'Bing' },
  'www.bing.com': { type: 'search', name: 'Bing' },
  'yahoo.com': { type: 'search', name: 'Yahoo!' },
  'www.yahoo.com': { type: 'search', name: 'Yahoo!' },
  'duckduckgo.com': { type: 'search', name: 'DuckDuckGo' },
  'www.duckduckgo.com': { type: 'search', name: 'DuckDuckGo' },
  'baidu.com': { type: 'search', name: 'Baidu' },
  'www.baidu.com': { type: 'search', name: 'Baidu' },

  // Social media
  'facebook.com': { type: 'social', name: 'Facebook' },
  'www.facebook.com': { type: 'social', name: 'Facebook' },
  'twitter.com': { type: 'social', name: 'Twitter' },
  'www.twitter.com': { type: 'social', name: 'Twitter' },
  'x.com': { type: 'social', name: 'X' },
  'www.x.com': { type: 'social', name: 'X' },
  'linkedin.com': { type: 'social', name: 'LinkedIn' },
  'www.linkedin.com': { type: 'social', name: 'LinkedIn' },
  'instagram.com': { type: 'social', name: 'Instagram' },
  'www.instagram.com': { type: 'social', name: 'Instagram' },
  'tiktok.com': { type: 'social', name: 'TikTok' },
  'www.tiktok.com': { type: 'social', name: 'TikTok' },
  'youtube.com': { type: 'social', name: 'YouTube' },
  'www.youtube.com': { type: 'social', name: 'YouTube' },
  'reddit.com': { type: 'social', name: 'Reddit' },
  'www.reddit.com': { type: 'social', name: 'Reddit' },
};

function getHostname(url: string | undefined): string {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

export function parseReferrer(url: string | undefined) {
  const hostname = getHostname(url);
  const match = referrers[hostname] ?? referrers[hostname.replace('www.', '')];

  return {
    name: match?.name ?? '',
    type: match?.type ?? 'referral',
    url: stripTrailingSlash(url ?? ''),
  };
}

export function getReferrerWithQuery(
  query: Record<string, string> | undefined,
) {
  if (!query) {
    return null;
  }

  const source = query.utm_source ?? query.ref ?? query.utm_referrer ?? '';

  if (source === '') {
    return null;
  }

  const match =
    Object.values(referrers).find(
      (referrer) => referrer.name.toLowerCase() === source.toLowerCase(),
    ) || referrers[source];

  if (match) {
    return {
      name: match.name,
      type: match.type,
      url: '',
    };
  }

  return {
    name: source,
    type: 'referral',
    url: '',
  };
}
