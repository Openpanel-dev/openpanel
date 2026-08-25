/**
 * Webhook delivery is reachable from two very different places:
 *
 *  - the dashboard's "send test notification" button, which runs in the
 *    browser and is just the user calling their own webhook, and
 *  - the worker, which sends from inside our network and therefore must not be
 *    usable as an SSRF probe.
 *
 * Injecting the transport keeps this module browser-safe (a plain `fetch`) while
 * letting server callers pass the SSRF-guarded one from `./safe-fetcher`, which
 * pulls in `node:dns`/`undici` and must never reach a client bundle.
 */

export type WebhookFetcher = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{ status: number }>;

export interface WebhookResult {
  ok: boolean;
  status: number;
}

export const browserFetcher: WebhookFetcher = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status };
};

export async function postWebhook(
  fetcher: WebhookFetcher,
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
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

    return { ok: status >= 200 && status < 300, status };
  } catch {
    return { ok: false, status: 0 };
  }
}
