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
  const match = referrers[getHostname(url)];

  console.log('Parsing referrer', url);
  console.log('Match', match);

  return {
    name: match?.name ?? '',
    type: match?.type ?? 'unknown',
    url: url ?? '',
  };
}
