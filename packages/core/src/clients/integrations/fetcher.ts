/**
 * Webhook delivery runs both in the browser (the dashboard's "send test
 * notification" button) and in the worker, which must not be usable as an SSRF
 * probe. The injected transport keeps this module browser-safe: server callers
 * pass the SSRF-guarded fetcher, which pulls in `node:dns`/`undici` and must
 * never reach a client bundle.
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
   * Classified once here: 429 and 5xx are worth another delivery attempt, any
   * other 4xx is the destination refusing this exact request. A failure with no
   * response (DNS, connect, TLS, timeout) is retryable.
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
