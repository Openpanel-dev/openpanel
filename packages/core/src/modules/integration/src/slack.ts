// Ported from @openpanel/integrations (dissolved into core — M4-005). Moved out
// of `clients/integrations/` by M15-008: this module is its only consumer
// (ADR-022 A2). Cred to (@c_alares)
// https://github.com/christianalares/seventy-seven/blob/main/packages/integrations/src/slack/index.ts

import * as Slack from '@slack/bolt';
import {
  browserFetcher,
  postWebhook,
  type WebhookFetcher,
  type WebhookResult,
} from '../../../clients/integrations/fetcher';
import type { CoreConfig } from '../../../config';

const { LogLevel, App: SlackApp } = Slack;

import { InstallProvider } from '@slack/oauth';

const INSTALL_SCOPES = [
  'incoming-webhook',
  'chat:write',
  'chat:write.public',
  'team:read',
];

/**
 * Built from the credentials the config loader parsed. Without a client id
 * there is no install flow, and the stub keeps the two members the integration
 * module touches so an unconfigured deployment still boots.
 */
export function slackInstaller(config: CoreConfig): InstallProvider {
  const { clientId, clientSecret, stateSecret } = config.slack;
  if (!clientId) {
    return {
      generateInstallUrl: () => {},
      stateStore: {},
    } as unknown as InstallProvider;
  }
  return new InstallProvider({
    clientId,
    // An id without a secret is a misconfiguration Slack itself rejects.
    clientSecret: clientSecret ?? '',
    stateSecret,
    logLevel: config.isDevelopment ? LogLevel.DEBUG : undefined,
  });
}

/**
 * `null` when this deployment has no Slack app configured — ADR-022 R9: a
 * missing thing is null, not an error. The caller decides what an absent
 * install flow means for its own surface.
 */
export const getSlackInstallUrl = ({
  config,
  integrationId,
  organizationId,
  projectId,
}: {
  config: CoreConfig;
  integrationId: string;
  organizationId: string;
  projectId: string;
}): Promise<string> | null => {
  if (!config.slack.clientId) {
    return null;
  }
  return slackInstaller(config).generateInstallUrl({
    scopes: INSTALL_SCOPES,
    redirectUri: config.slack.oauthRedirectUrl,
    metadata: JSON.stringify({ integrationId, organizationId, projectId }),
  });
};

export function sendSlackNotification({
  webhookUrl,
  message,
  fetcher = browserFetcher,
}: {
  webhookUrl: string;
  message: string;
  /**
   * Server callers MUST pass `safeWebhookFetcher` from `./safe-fetcher`. The URL
   * comes from Slack's OAuth response rather than raw user input, but it is
   * still a stored URL we POST to from inside our network.
   */
  fetcher?: WebhookFetcher;
}): Promise<WebhookResult> {
  return postWebhook(fetcher, webhookUrl, { text: message });
}
