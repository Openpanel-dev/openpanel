// Ported from @openpanel/integrations (dissolved into core — M4-005).
// Cred to (@c_alares) https://github.com/christianalares/seventy-seven/blob/main/packages/integrations/src/slack/index.ts

import * as Slack from '@slack/bolt';
import type { CoreConfig } from '../../config';
import {
  browserFetcher,
  postWebhook,
  type WebhookFetcher,
  type WebhookResult,
} from './fetcher';

const { LogLevel, App: SlackApp } = Slack;

import { InstallProvider } from '@slack/oauth';

const INSTALL_SCOPES = [
  'incoming-webhook',
  'chat:write',
  'chat:write.public',
  'team:read',
];

/**
 * Built from the credentials the config loader parsed (ADR-022 R9). Without a
 * client id there is no install flow, and the stub keeps the two members the
 * integration module touches so an unconfigured deployment still boots.
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
}) => {
  if (!config.slack.clientId) {
    throw new Error('SLACK_CLIENT_ID is not set (slack.ts)');
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
