// Ported from @openpanel/integrations (dissolved into core — M4-005).
/**
 * Webhook delivery is reachable from two very different places:
 *
 *  - the dashboard's "send test notification" button, which runs in the
 *    browser and is just the user calling their own webhook, and
 *  - the worker, which sends from inside our network and therefore must not be
 *    usable as an SSRF probe.
 *
 * Injecting the transport keeps this module browser-safe (a plain `fetch`) while
 * letting server callers pass the SSRF-guarded one from the integration
 * module's `src/safe-fetcher.ts`, which
 * pulls in `node:dns`/`undici` and must never reach a client bundle.
 */

import { isRetryableStatus } from '../provider-error';

export type WebhookFetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{ status: number }>;

/** No response at all — the request never reached the far end. */
const NO_RESPONSE_STATUS = 0;

export interface WebhookResult {
  ok: boolean;
  status: number;
  /**
   * ADR-022 R19, classified once here so no caller re-derives it: 429 and 5xx
   * are worth another delivery attempt, every other 4xx is the destination
   * refusing this exact request. A transport failure that produced no response
   * (DNS, connect, TLS, timeout) is retryable — nothing about the request was
   * rejected.
   */
  retryable: boolean;
}

export const browserFetcher: WebhookFetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status };
};

export async function postWebhook(
  fetcher: WebhookFetcher,
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<WebhookResult> {
  try {
    const { status } = await fetcher(url, {
      method: 'POST',
      headers: {
        ...extraHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const ok = status >= 200 && status < 300;
    return { ok, status, retryable: !ok && isRetryableStatus(status) };
  } catch {
    return { ok: false, status: NO_RESPONSE_STATUS, retryable: true };
  }
}
