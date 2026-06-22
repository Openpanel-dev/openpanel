/**
 * Append consistent UTM params to a link used in an email.
 *
 * Convention:
 * - utm_source: always `openpanel` (the sender/product)
 * - utm_medium: always `email` (the channel — groups all email traffic)
 * - utm_campaign: the specific email/template (distinguishes emails)
 */
export function withUtm(url: string, campaign: string): string {
  const next = new URL(url);
  next.searchParams.set('utm_source', 'openpanel');
  next.searchParams.set('utm_medium', 'email');
  next.searchParams.set('utm_campaign', campaign);
  return next.toString();
}
