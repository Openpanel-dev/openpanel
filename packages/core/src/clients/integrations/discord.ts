// Adapted from OpenStatusHQ's Discord notifier:
// https://github.com/openstatusHQ/openstatus/blob/main/packages/notifications/discord/src/index.ts

import {
  browserFetcher,
  postWebhook,
  type WebhookFetcher,
  type WebhookResult,
} from './fetcher';

// Lives here rather than in integration.constants.ts: a client has no need of
// another module's vocabulary. It is this transport's own probe wording, and
// nothing outside this file reads it.
const DISCORD_TEST_NOTIFICATION_MESSAGE =
  '**🧪 Test [OpenPanel.dev](<https://openpanel.dev/>)**\nIf you can read this, your Discord webhook is functioning correctly!\n';

export function sendDiscordNotification({
  webhookUrl,
  message,
  fetcher = browserFetcher,
}: {
  webhookUrl: string;
  message: string;
  /**
   * Server callers MUST pass `safeWebhookFetcher` from the integration
   * module's `src/safe-fetcher.ts` - the
   * webhook URL is user-supplied and stored, so sending from inside our network
   * with a bare `fetch` makes this an SSRF probe.
   */
  fetcher?: WebhookFetcher;
}): Promise<WebhookResult> {
  return postWebhook(fetcher, webhookUrl, {
    content: message,
    avatar_url: 'https://openpanel.dev/logo.jpg',
    username: 'OpenPanel Notifications',
  });
}

export function sendTestDiscordNotification(
  webhookUrl: string,
  fetcher: WebhookFetcher = browserFetcher
) {
  return sendDiscordNotification({
    webhookUrl,
    fetcher,
    message: DISCORD_TEST_NOTIFICATION_MESSAGE,
  });
}
