// The API redacts integration credentials before they reach a client. Delivery
// still has to see the real values, so this pins the worker to the full stored
// row rather than anything that went through the redaction.

import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  safeWebhookFetcherMock,
  sendDiscordNotificationMock,
  sendSlackNotificationMock,
} = vi.hoisted(() => ({
  dbMock: {
    integration: {
      findUniqueOrThrow: vi.fn(),
    },
  },
  safeWebhookFetcherMock: vi.fn().mockResolvedValue({ status: 200 }),
  sendDiscordNotificationMock: vi.fn().mockResolvedValue({ ok: true }),
  sendSlackNotificationMock: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  Prisma: { JsonNull: Symbol('JsonNull'), DbNull: Symbol('DbNull') },
}));

vi.mock('@openpanel/email', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@openpanel/redis', () => ({
  publishEvent: vi.fn(),
}));

vi.mock('@openpanel/integrations/src/safe-fetcher', () => ({
  safeWebhookFetcher: safeWebhookFetcherMock,
}));

vi.mock('@openpanel/integrations/src/discord', () => ({
  sendDiscordNotification: sendDiscordNotificationMock,
  sendTestDiscordNotification: vi.fn(),
}));

vi.mock('@openpanel/integrations/src/slack', () => ({
  sendSlackNotification: sendSlackNotificationMock,
}));

const { notificationJob } = await import('./notification');

const notification = {
  id: 'notification-1',
  projectId: 'project-1',
  title: 'New signup',
  message: 'someone signed up',
  integrationId: 'integration-1',
  sendToApp: false,
  sendToEmail: false,
  payload: { type: 'event', event: { name: 'signup' } },
};

const job = {
  data: {
    type: 'sendNotification',
    payload: { notification },
  },
} as unknown as Job<never>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationJob', () => {
  it('sends the stored webhook header values', async () => {
    dbMock.integration.findUniqueOrThrow.mockResolvedValue({
      id: 'integration-1',
      name: 'Zapier',
      organizationId: 'org-1',
      projectId: 'project-1',
      config: {
        type: 'webhook',
        url: 'https://hooks.zapier.test/abc',
        headers: { Authorization: 'Bearer super-secret' },
        mode: 'message',
      },
    });

    await notificationJob(job);

    expect(safeWebhookFetcherMock).toHaveBeenCalledWith(
      'https://hooks.zapier.test/abc',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer super-secret',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('sends to the stored slack incoming webhook url', async () => {
    dbMock.integration.findUniqueOrThrow.mockResolvedValue({
      id: 'integration-1',
      name: 'Slack',
      organizationId: 'org-1',
      projectId: 'project-1',
      config: {
        type: 'slack',
        access_token: 'xoxb-super-secret',
        incoming_webhook: {
          url: 'https://hooks.slack.test/services/T/B/secret',
        },
      },
    });

    await notificationJob(job);

    expect(sendSlackNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: 'https://hooks.slack.test/services/T/B/secret',
      }),
    );
  });

  it('sends to the stored discord webhook url', async () => {
    dbMock.integration.findUniqueOrThrow.mockResolvedValue({
      id: 'integration-1',
      name: 'Discord',
      organizationId: 'org-1',
      projectId: 'project-1',
      config: { type: 'discord', url: 'https://discord.test/webhook' },
    });

    await notificationJob(job);

    expect(sendDiscordNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ webhookUrl: 'https://discord.test/webhook' }),
    );
  });
});
