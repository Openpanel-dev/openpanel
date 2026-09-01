// notification.rules embeds the integrations attached to each rule. Those rows
// carry the credentials the worker delivers with, so this pins the response to
// the redacted shape for a read-level project member — the lowest access that
// can call it.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, getProjectAccessMock, getOrganizationAccessMock } = vi.hoisted(
  () => ({
    dbMock: {
      notificationRule: {
        findMany: vi.fn(),
      },
      integration: {},
      project: {},
    },
    getProjectAccessMock: vi.fn(),
    getOrganizationAccessMock: vi.fn(),
  }),
);

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  APP_NOTIFICATION_INTEGRATION_ID: 'app',
  EMAIL_NOTIFICATION_INTEGRATION_ID: 'email',
  BASE_INTEGRATIONS: [
    {
      id: 'app',
      name: 'Website',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      config: { type: 'app' },
      organizationId: '',
      projectId: null,
    },
  ],
  isBaseIntegration: (id: string) => id === 'app' || id === 'email',
  getNotificationRulesByProjectId: Object.assign(vi.fn(), {
    clear: vi.fn(),
  }),
  getProjectAccess: getProjectAccessMock,
  getOrganizationAccess: getOrganizationAccessMock,
  getClientAccess: vi.fn(),
  getProjectById: vi.fn(),
  canWriteProject: vi.fn(),
  runWithAlsSession: (_sessionId: string | null, fn: () => unknown) => fn(),
}));

vi.mock('@openpanel/integrations/src/slack', () => ({
  getSlackInstallUrl: vi.fn().mockResolvedValue('https://slack.test/install'),
  sendSlackNotification: vi.fn(),
}));

const { notificationRouter } = await import('./notification');

const PROJECT_ID = 'project-1';
const ORG_ID = 'org-1';

const RULE = {
  id: 'rule-1',
  name: 'Signups',
  projectId: PROJECT_ID,
  sendToApp: true,
  sendToEmail: false,
  config: { type: 'events', events: [] },
  template: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  integrations: [
    {
      id: 'slack-1',
      name: 'Slack',
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      config: {
        type: 'slack',
        access_token: 'xoxb-super-secret',
        incoming_webhook: {
          channel: '#alerts',
          url: 'https://hooks.slack.test/services/T/B/secret',
        },
      },
    },
    {
      id: 'webhook-1',
      name: 'Zapier',
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      config: {
        type: 'webhook',
        url: 'https://hooks.zapier.test/abc',
        headers: { Authorization: 'Bearer super-secret' },
        mode: 'message',
      },
    },
  ],
};

const SECRETS = [
  'xoxb-super-secret',
  'https://hooks.slack.test/services/T/B/secret',
  'Bearer super-secret',
];

function caller(userId: string) {
  return notificationRouter.createCaller({
    session: { userId, session: { id: 'session-1' } },
    req: { log: { info: vi.fn() } },
    res: {},
    setCookie: vi.fn(),
    cookies: {},
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccessMock.mockResolvedValue({
    id: 'access-1',
    userId: 'user-1',
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    level: 'read',
  });
  dbMock.notificationRule.findMany.mockResolvedValue([RULE]);
});

describe('notification.rules', () => {
  it('returns no credential values to a read-level project member', async () => {
    const result = await caller('user-1').rules({ projectId: PROJECT_ID });

    const serialized = JSON.stringify(result);
    for (const secret of SECRETS) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('keeps the base integrations and the attached ones, with what the rule card reads', async () => {
    const [rule] = await caller('user-1').rules({ projectId: PROJECT_ID });

    expect(rule?.integrations).toEqual([
      expect.objectContaining({ id: 'app', name: 'Website' }),
      expect.objectContaining({
        id: 'slack-1',
        name: 'Slack',
        config: expect.objectContaining({
          type: 'slack',
          access_token: '',
          incoming_webhook: { channel: '#alerts', url: '' },
        }),
      }),
      expect.objectContaining({
        id: 'webhook-1',
        name: 'Zapier',
        config: {
          type: 'webhook',
          url: 'https://hooks.zapier.test/abc',
          headers: { Authorization: '' },
          mode: 'message',
        },
      }),
    ]);
  });
});
