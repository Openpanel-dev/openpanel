/**
 * Given a session's referrer + UTM data, classify the acquisition source
 * into a human-readable channel/platform and (when possible) extract the
 * search keyword the visitor used.
 *
 * Rules are heuristic — there's no single universal standard for UTM
 * tagging — but the patterns here cover the conventions used by the
 * major ad platforms (Google / Meta / TikTok / Apple Search Ads / Reddit
 * / LinkedIn / X / Pinterest / Microsoft / Snapchat) and the main search
 * engines that still leak query terms in the referrer.
 */

export type SourceChannel =
  | 'paid-search'
  | 'paid-social'
  | 'paid-video'
  | 'organic-search'
  | 'organic-social'
  | 'email'
  | 'referral'
  | 'direct';

export type SourceInput = {
  referrer?: string | null;
  referrerName?: string | null;
  referrerType?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
};

export type ClassifiedSource = {
  channel: SourceChannel;
  /** "Google Ads", "Meta Ads", "Organic search", "Direct", etc. */
  label: string;
  /** Platform/brand name if we recognise one (e.g. "Google", "TikTok"). */
  platform: string | null;
  /** Search query the visitor used, if we can recover one. */
  keyword: string | null;
  /** The campaign name (utm_campaign) passed through verbatim. */
  campaign: string | null;
};

const PAID_MEDIUMS = new Set([
  'cpc',
  'ppc',
  'paid',
  'paidsearch',
  'paid-search',
  'paid_search',
  'paidsocial',
  'paid-social',
  'paid_social',
  'display',
  'banner',
  'cpm',
  'retargeting',
  'sponsored',
]);

// utm_source → friendly platform name. Matched case-insensitively and
// partially so `google_ads`, `googleads`, `google-ads` all resolve to
// "Google".
const PLATFORM_PATTERNS: Array<{ match: RegExp; platform: string }> = [
  { match: /google[_-]?ads?|adwords|^google$|\bgads\b/i, platform: 'Google' },
  { match: /facebook|\bfb\b|meta|instagram|\big\b/i, platform: 'Meta' },
  { match: /tiktok/i, platform: 'TikTok' },
  { match: /apple[_-]?search|\basa\b/i, platform: 'Apple Search Ads' },
  { match: /linkedin/i, platform: 'LinkedIn' },
  { match: /reddit/i, platform: 'Reddit' },
  { match: /twitter|\bx[_-]?ads\b|^x$/i, platform: 'X' },
  { match: /pinterest/i, platform: 'Pinterest' },
  { match: /snapchat|\bsnap\b/i, platform: 'Snapchat' },
  { match: /microsoft|\bbing[_-]?ads?\b/i, platform: 'Microsoft' },
  { match: /youtube/i, platform: 'YouTube' },
];

const SEARCH_ENGINE_HOSTS: Record<string, string[]> = {
  google: ['q'],
  bing: ['q'],
  duckduckgo: ['q'],
  yahoo: ['p', 'q'],
  yandex: ['text'],
  baidu: ['wd', 'word'],
  ecosia: ['q'],
  brave: ['q'],
  startpage: ['q', 'query'],
};

function recognisePlatform(utmSource?: string | null): string | null {
  if (!utmSource) {
    return null;
  }
  for (const { match, platform } of PLATFORM_PATTERNS) {
    if (match.test(utmSource)) {
      return platform;
    }
  }
  // Fall back to capitalising the raw utm_source so "newsletter" → "Newsletter".
  const trimmed = utmSource.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Try to pull the search query out of a referrer URL. Mostly useful for
 * search engines that still leak the query (Bing, DuckDuckGo, Yahoo) —
 * Google has stripped `q=` from organic referrers for years, so for
 * Google hits the keyword usually only appears if utm_term is set.
 */
function extractKeywordFromReferrer(referrer?: string | null): string | null {
  if (!referrer) {
    return null;
  }
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    for (const [engine, params] of Object.entries(SEARCH_ENGINE_HOSTS)) {
      if (host.includes(engine)) {
        for (const param of params) {
          const value = url.searchParams.get(param);
          if (value) {
            return value;
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function classifySource(input: SourceInput): ClassifiedSource {
  const utmSource = input.utmSource?.trim() || '';
  const utmMedium = (input.utmMedium ?? '').trim().toLowerCase();
  const utmTerm = input.utmTerm?.trim() || '';
  const utmCampaign = input.utmCampaign?.trim() || null;
  const referrer = input.referrer?.trim() || '';
  const referrerName = input.referrerName?.trim() || '';
  const referrerType = (input.referrerType ?? '').trim().toLowerCase();

  const platform = recognisePlatform(utmSource) ?? referrerName ?? null;
  const keyword =
    utmTerm || extractKeywordFromReferrer(referrer) || null;
  const isPaid = PAID_MEDIUMS.has(utmMedium) || utmMedium.includes('paid');

  // Paid channels first — presence of utm_source + a paid medium is the
  // strongest signal we have.
  if (isPaid && utmSource) {
    const platformName = platform ?? 'Unknown';
    if (/youtube/i.test(utmSource) || utmMedium === 'video') {
      return {
        channel: 'paid-video',
        label: `${platformName} Ads`,
        platform: platformName,
        keyword,
        campaign: utmCampaign,
      };
    }
    if (/(facebook|instagram|meta|tiktok|linkedin|reddit|twitter|x|pinterest|snapchat)/i.test(utmSource)) {
      return {
        channel: 'paid-social',
        label: `${platformName} Ads`,
        platform: platformName,
        keyword,
        campaign: utmCampaign,
      };
    }
    return {
      channel: 'paid-search',
      label: `${platformName} Ads`,
      platform: platformName,
      keyword,
      campaign: utmCampaign,
    };
  }

  // Email campaigns (newsletters, transactional link-outs).
  if (utmMedium === 'email' || utmMedium === 'newsletter') {
    return {
      channel: 'email',
      label: platform ? `Email · ${platform}` : 'Email',
      platform,
      keyword: null,
      campaign: utmCampaign,
    };
  }

  // Untagged organic-social (user shared a link to Twitter etc).
  if (referrerType === 'social' || referrerName && /social/i.test(referrerName)) {
    return {
      channel: 'organic-social',
      label: `Organic · ${referrerName || platform || 'Social'}`,
      platform: referrerName || platform,
      keyword: null,
      campaign: utmCampaign,
    };
  }

  // Organic search — referrer from a known search engine, or
  // referrerType explicitly set by the ingestion pipeline.
  if (referrerType === 'search') {
    return {
      channel: 'organic-search',
      label: `Organic search · ${referrerName || 'Search engine'}`,
      platform: referrerName || null,
      keyword,
      campaign: utmCampaign,
    };
  }

  // Any other referrer = referral traffic (news site, blog, partner, …).
  if (referrer || referrerName) {
    return {
      channel: 'referral',
      label: `Referral · ${referrerName || referrer}`,
      platform: referrerName || null,
      keyword,
      campaign: utmCampaign,
    };
  }

  // No referrer and no platform, but the link was tagged with a campaign
  // (e.g. a printed QR code or an SMS blast where `utm_campaign=spring24`
  // is the only signal we get). Surface it as a referral so the campaign
  // name is still visible — otherwise the source card would just say
  // "Direct" and we'd lose the attribution.
  if (utmCampaign || utmSource) {
    return {
      channel: 'referral',
      label: utmSource
        ? `Campaign · ${utmSource}`
        : `Campaign · ${utmCampaign}`,
      platform: platform,
      keyword,
      campaign: utmCampaign,
    };
  }

  // Nothing at all.
  return {
    channel: 'direct',
    label: 'Direct',
    platform: null,
    keyword: null,
    campaign: null,
  };
}
