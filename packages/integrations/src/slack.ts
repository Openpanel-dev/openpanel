// Cred to (@c_alares) https://github.com/christianalares/seventy-seven/blob/main/packages/integrations/src/slack/index.ts

import * as Slack from '@slack/bolt';
const { LogLevel, App: SlackApp } = Slack;
import { InstallProvider } from '@slack/oauth';

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_OAUTH_REDIRECT_URL = process.env.SLACK_OAUTH_REDIRECT_URL;
const SLACK_STATE_SECRET = process.env.SLACK_STATE_SECRET;

export const slackInstaller = SLACK_CLIENT_ID
  ? new InstallProvider({
      clientId: SLACK_CLIENT_ID!,
      clientSecret: SLACK_CLIENT_SECRET!,
      stateSecret: SLACK_STATE_SECRET,
      logLevel:
        process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : undefined,
    })
  : ({
      generateInstallUrl: () => {},
      stateStore: {},
    } as unknown as InstallProvider);

export const getSlackInstallUrl = ({
  integrationId,
  organizationId,
}: { integrationId: string; organizationId: string }) => {
  if (!SLACK_CLIENT_ID) {
    throw new Error('SLACK_CLIENT_ID is not set (slack.ts)');
  }
  return slackInstaller.generateInstallUrl({
    scopes: [
      'incoming-webhook',
      'chat:write',
      'chat:write.public',
      'team:read',
    ],
    redirectUri: SLACK_OAUTH_REDIRECT_URL,
    metadata: JSON.stringify({ integrationId, organizationId }),
  });
};

export function sendSlackNotification({
  webhookUrl,
  message,
}: {
  webhookUrl: string;
  message: string;
}) {
  return fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: message,
    }),
  });
}
