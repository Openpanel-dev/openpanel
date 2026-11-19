// The referrers the seed sends traffic from. Name and type are what core's
// `parseReferrer` (its generated referrer catalogue) answers for each URL,
// copied here so the seed stays out of core's dependency graph; `null` is
// direct traffic.

import type { Referrer } from '../model';
import type { Weighted } from '../rng';

export const REFERRERS = {
  google: { url: 'https://www.google.com', name: 'Google', type: 'search' },
  bing: { url: 'https://www.bing.com', name: 'Bing', type: 'search' },
  duckDuckGo: {
    url: 'https://duckduckgo.com',
    name: 'DuckDuckGo',
    type: 'search',
  },
  twitter: { url: 'https://t.co', name: 'Twitter', type: 'social' },
  facebook: { url: 'https://m.facebook.com', name: 'Facebook', type: 'social' },
  reddit: { url: 'https://www.reddit.com', name: 'Reddit', type: 'social' },
  hackerNews: {
    url: 'https://news.ycombinator.com',
    name: 'Hacker News',
    type: 'social',
  },
  linkedIn: {
    url: 'https://www.linkedin.com',
    name: 'LinkedIn',
    type: 'social',
  },
  instagram: {
    url: 'https://l.instagram.com',
    name: 'Instagram',
    type: 'social',
  },
  youTube: { url: 'https://www.youtube.com', name: 'Youtube', type: 'social' },
  gitHub: { url: 'https://github.com', name: 'GitHub', type: 'tech' },
  chatGpt: { url: 'https://chatgpt.com', name: 'ChatGPT', type: 'ai' },
  claude: { url: 'https://claude.ai', name: 'Claude', type: 'ai' },
  medium: { url: 'https://medium.com', name: 'Medium', type: 'content' },
  substack: { url: 'https://substack.com', name: 'Substack', type: 'content' },
  gmail: { url: 'https://mail.google.com', name: 'Gmail', type: 'email' },
  productHunt: {
    url: 'https://www.producthunt.com',
    name: 'Product Hunt',
    type: 'social',
  },
} as const satisfies Record<string, Referrer>;

export type ReferrerMix = readonly Weighted<Referrer | null>[];

export interface Campaign {
  source: string;
  medium: string;
  name: string;
}

export const CAMPAIGNS: readonly Weighted<Campaign>[] = [
  { weight: 5, value: { source: 'google', medium: 'cpc', name: 'brand' } },
  { weight: 4, value: { source: 'google', medium: 'cpc', name: 'generic' } },
  {
    weight: 3,
    value: { source: 'facebook', medium: 'paid_social', name: 'autumn-sale' },
  },
  {
    weight: 3,
    value: { source: 'instagram', medium: 'paid_social', name: 'new-arrivals' },
  },
  {
    weight: 2,
    value: { source: 'newsletter', medium: 'email', name: 'weekly-digest' },
  },
  {
    weight: 2,
    value: { source: 'linkedin', medium: 'paid_social', name: 'b2b-launch' },
  },
  {
    weight: 1,
    value: { source: 'producthunt', medium: 'referral', name: 'launch' },
  },
];

/** By name and by the hostname's own label, the two ways a `utm_source` names a referrer. */
const KNOWN_SOURCES: Record<string, Referrer> = Object.fromEntries(
  Object.values(REFERRERS).flatMap((referrer) => {
    const label =
      new URL(referrer.url).hostname
        .replace(/^(www|m|l)\./, '')
        .split('.')[0] ?? '';
    return [
      [referrer.name.toLowerCase(), referrer],
      [label, referrer],
    ];
  })
);

/**
 * What the ingest handler stores for a landing event: the referrer's URL, but a
 * `utm_source` that names a known referrer overrides its name and type, and
 * an unknown one becomes the name with no type (`getReferrerWithQuery`).
 */
export function sessionReferrer(
  referrer: Referrer | null,
  query: Record<string, string> | undefined
): Referrer {
  const source = (
    query?.utm_source ??
    query?.ref ??
    query?.utm_referrer ??
    ''
  ).toLowerCase();
  const fromQuery =
    source === ''
      ? null
      : (KNOWN_SOURCES[source] ?? { url: '', name: source, type: '' });
  return {
    url: referrer?.url ?? '',
    name: fromQuery?.name || referrer?.name || referrer?.url || '',
    type: fromQuery?.type || referrer?.type || '',
  };
}
