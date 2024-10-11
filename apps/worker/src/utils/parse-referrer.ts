import { stripTrailingSlash } from '@openpanel/common';

import referrers from '../referrers';

function getHostname(url: string | undefined) {
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
    type: match?.type ?? 'unknown',
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
    type: 'unknown',
    url: '',
  };
}
