import referrers from '../referrers';

export function parseReferrer(url?: string) {
  const { hostname } = new URL(url || '');
  const match = referrers[hostname];

  console.log('Parsing referrer', url);
  console.log('Match', match);

  return {
    name: match?.name ?? '',
    type: match?.type ?? 'unknown',
    url: url ?? '',
  };
}
