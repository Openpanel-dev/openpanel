import { safeFetch } from '@openpanel/common/server/safe-fetch';
import type { WebhookFetcher } from './fetcher';

/**
 * Server-side webhook transport. Resolves the host, refuses non-publicly
 * routable addresses, pins the socket to the address it validated and
 * re-validates every redirect hop, so a stored webhook URL cannot be used to
 * reach loopback, RFC1918 neighbours or cloud metadata.
 *
 * Node-only - never import this from browser code.
 */
export const safeWebhookFetcher: WebhookFetcher = async (url, init) => {
  const res = await safeFetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    timeoutMs: 10_000,
  });

  return { status: res.status };
};
