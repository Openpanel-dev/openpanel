// Ported from @openpanel/integrations (dissolved into core — M4-005).
// Cred to (@OpenStatusHQ) https://github.com/openstatusHQ/openstatus/blob/main/packages/notifications/discord/src/index.ts

import { DISCORD_TEST_NOTIFICATION_MESSAGE } from '../../modules/integration/integration.constants';
import {
  browserFetcher,
  postWebhook,
  type WebhookFetcher,
  type WebhookResult,
} from './fetcher';

export function sendDiscordNotification({
  webhookUrl,
  message,
  fetcher = browserFetcher,
}: {
  webhookUrl: string;
  message: string;
  /**
   * Server callers MUST pass `safeWebhookFetcher` from `./safe-fetcher` - the
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
