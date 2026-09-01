// Integration configs hold third-party credentials: the Slack bot token and
// incoming-webhook url, webhook header values, object-store keys. These tests
// pin every procedure that returns an integration row to the redacted shape,
// for both kinds of row a user can reach: a project-scoped one (read-level
// project member) and a legacy org-wide one (plain organization member).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, getProjectAccessMock, getOrganizationAccessMock } = vi.hoisted(
  () => ({
    dbMock: {
      integration: {
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      project: {
        findUniqueOrThrow: vi.fn(),
      },
    },
    getProjectAccessMock: vi.fn(),
    getOrganizationAccessMock: vi.fn(),
  }),
);

vi.mock('@openpanel/db', () => ({
  db: dbMock,
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
  getProjectAccess: getProjectAccessMock,
  getOrganizationAccess: getOrganizationAccessMock,
  getClientAccess: vi.fn(),
  getProjectById: vi.fn(),
  canWriteProject: (access: { level?: string }) =>
    access.level === 'write' || access.level === 'admin',
  runWithAlsSession: (_sessionId: string | null, fn: () => unknown) => fn(),
}));

vi.mock('@openpanel/integrations/src/slack', () => ({
  getSlackInstallUrl: vi.fn().mockResolvedValue('https://slack.test/install'),
  sendSlackNotification: vi.fn(),
}));

// The generic upsert runs the plugin's connection test with the real
// credentials before saving. Stub the adapters so the S3 case never talks to
// the network.
vi.mock('@openpanel/integrations/src/object-store', () => ({
  createS3Adapter: () => ({
    testConnection: async () => ({ success: true }),
  }),
  createGCSAdapter: () => ({
    testConnection: async () => ({ success: true }),
  }),
}));

const { integrationRouter } = await import('./integration');

const ORG_ID = 'org-1';
const PROJECT_ID = 'project-1';

const SLACK_ROW = {
  id: 'slack-1',
  name: 'Slack',
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  config: {
    type: 'slack',
    access_token: 'xoxb-super-secret',
    bot_user_id: 'U123',
    incoming_webhook: {
      channel: '#alerts',
      channel_id: 'C123',
      configuration_url: 'https://slack.test/config',
      url: 'https://hooks.slack.test/services/T/B/secret',
    },
  },
};

const WEBHOOK_ROW = {
  id: 'webhook-1',
  name: 'Zapier',
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  config: {
    type: 'webhook',
    url: 'https://hooks.zapier.test/abc',
    headers: {
      Authorization: 'Bearer super-secret',
      'X-Api-Key': 'another-secret',
    },
    mode: 'message',
  },
};

// Created before integrations were project-scoped; shared by the whole org.
const LEGACY_ORG_WIDE_ROW = {
  ...WEBHOOK_ROW,
  id: 'webhook-legacy',
  projectId: null,
};

const S3_ROW = {
  id: 's3-1',
  name: 'Warehouse',
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  config: {
    type: 's3_export',
    bucket: 'bucket',
    prefix: 'openpanel-exports',
    region: 'us-east-1',
    format: 'jsonl_gzip',
    encryption: 'SSE-S3',
    authMode: 'access_key',
    accessKeyId: 'AKIA',
    secretAccessKey: 'enc:stored-ciphertext',
  },
};

const SECRETS = [
  'xoxb-super-secret',
  'https://hooks.slack.test/services/T/B/secret',
  'Bearer super-secret',
  'another-secret',
  'enc:',
];

/** The credential values from the fixtures that appear anywhere in `value`. */
function leakedSecrets(value: unknown): string[] {
  const serialized = JSON.stringify(value);
  return SECRETS.filter((secret) => serialized.includes(secret));
}

function caller(userId: string) {
  return integrationRouter.createCaller({
    session: { userId, session: { id: 'session-1' } },
    req: { log: { info: vi.fn() } },
    res: {},
    setCookie: vi.fn(),
    cookies: {},
  } as never);
}

function grantProjectAccess(level: 'read' | 'write') {
  getProjectAccessMock.mockResolvedValue({
    id: 'access-1',
    userId: 'user-1',
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    level,
  });
}

function grantOrganizationMembership() {
  getOrganizationAccessMock.mockResolvedValue({
    id: 'member-1',
    role: 'member',
    userId: 'user-1',
    organizationId: ORG_ID,
  });
}

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.project.findUniqueOrThrow.mockResolvedValue({
    organizationId: ORG_ID,
  });
});

describe('integration.list', () => {
  it('returns no credential values to a read-level project member', async () => {
    grantProjectAccess('read');
    dbMock.integration.findMany.mockResolvedValue([
      SLACK_ROW,
      WEBHOOK_ROW,
      LEGACY_ORG_WIDE_ROW,
      S3_ROW,
    ]);

    const result = await caller('user-1').list({ projectId: PROJECT_ID });

    expect(leakedSecrets(result)).toEqual([]);
    expect(result.map((integration) => integration.id)).toEqual([
      'app',
      'slack-1',
      'webhook-1',
      'webhook-legacy',
      's3-1',
    ]);
  });

  it('keeps the non-secret config the dashboard renders', async () => {
    grantProjectAccess('read');
    dbMock.integration.findMany.mockResolvedValue([WEBHOOK_ROW]);

    const [, webhook] = await caller('user-1').list({ projectId: PROJECT_ID });

    // Header names stay so the edit form can show which headers exist; the
    // values are blanked, and a blank value on save means "keep the stored one".
    expect(webhook?.config).toEqual({
      type: 'webhook',
      url: 'https://hooks.zapier.test/abc',
      headers: { Authorization: '', 'X-Api-Key': '' },
      mode: 'message',
    });
  });

  it('keeps the half-configured integration filter', async () => {
    grantProjectAccess('read');
    dbMock.integration.findMany.mockResolvedValue([]);

    await caller('user-1').list({ projectId: PROJECT_ID });

    expect(dbMock.integration.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ config: { not: {} } }),
    });
  });
});

describe('integration.get', () => {
  it('returns no credential values to a read-level project member', async () => {
    grantProjectAccess('read');
    const trpc = caller('user-1');

    dbMock.integration.findUniqueOrThrow.mockResolvedValue(SLACK_ROW);
    expect(leakedSecrets(await trpc.get({ id: SLACK_ROW.id }))).toEqual([]);

    dbMock.integration.findUniqueOrThrow.mockResolvedValue(WEBHOOK_ROW);
    expect(leakedSecrets(await trpc.get({ id: WEBHOOK_ROW.id }))).toEqual([]);

    dbMock.integration.findUniqueOrThrow.mockResolvedValue(S3_ROW);
    expect(leakedSecrets(await trpc.get({ id: S3_ROW.id }))).toEqual([]);
  });

  it('returns no credential values for a legacy org-wide row to a plain organization member', async () => {
    grantOrganizationMembership();
    dbMock.integration.findUniqueOrThrow.mockResolvedValue(LEGACY_ORG_WIDE_ROW);

    const result = await caller('user-1').get({ id: LEGACY_ORG_WIDE_ROW.id });

    expect(getProjectAccessMock).not.toHaveBeenCalled();
    expect(leakedSecrets(result)).toEqual([]);
  });
});

describe('integration.delete', () => {
  it('returns only the id, not the deleted row', async () => {
    grantProjectAccess('write');
    dbMock.integration.findUniqueOrThrow.mockResolvedValue(WEBHOOK_ROW);
    dbMock.integration.delete.mockResolvedValue(WEBHOOK_ROW);

    const result = await caller('user-1').delete({ id: WEBHOOK_ROW.id });

    expect(dbMock.integration.delete).toHaveBeenCalledWith({
      where: { id: WEBHOOK_ROW.id },
    });
    expect(result).toEqual({ id: WEBHOOK_ROW.id });
  });
});

describe('integration.createOrUpdate', () => {
  beforeEach(() => {
    grantProjectAccess('write');
    dbMock.integration.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...WEBHOOK_ROW,
        ...data,
      }),
    );
    dbMock.integration.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...S3_ROW,
        ...data,
      }),
    );
  });

  it('keeps stored header values when the form submits them blank', async () => {
    dbMock.integration.findUniqueOrThrow.mockResolvedValue(WEBHOOK_ROW);

    await caller('user-1').createOrUpdate({
      id: WEBHOOK_ROW.id,
      name: 'Zapier',
      projectId: PROJECT_ID,
      config: {
        type: 'webhook',
        url: 'https://hooks.zapier.test/abc',
        mode: 'message',
        headers: { Authorization: '', 'X-Api-Key': '' },
      },
    });

    expect(dbMock.integration.update.mock.calls[0]?.[0].data.config).toEqual({
      type: 'webhook',
      url: 'https://hooks.zapier.test/abc',
      mode: 'message',
      headers: {
        Authorization: 'Bearer super-secret',
        'X-Api-Key': 'another-secret',
      },
    });
  });

  it('does not echo the carried-over header values back', async () => {
    dbMock.integration.findUniqueOrThrow.mockResolvedValue(WEBHOOK_ROW);

    const result = await caller('user-1').createOrUpdate({
      id: WEBHOOK_ROW.id,
      name: 'Zapier',
      projectId: PROJECT_ID,
      config: {
        type: 'webhook',
        url: 'https://hooks.zapier.test/abc',
        mode: 'message',
        headers: { Authorization: '' },
      },
    });

    expect(leakedSecrets(result)).toEqual([]);
    expect(result.config).toEqual({
      type: 'webhook',
      url: 'https://hooks.zapier.test/abc',
      mode: 'message',
      headers: { Authorization: '' },
    });
  });

  it('does not echo the ciphertext of an encrypted credential back', async () => {
    const result = await caller('user-1').createOrUpdate({
      name: 'Warehouse',
      projectId: PROJECT_ID,
      config: {
        type: 's3_export',
        bucket: 'bucket',
        region: 'us-east-1',
        authMode: 'access_key',
        accessKeyId: 'AKIA',
        secretAccessKey: 'plaintext-secret',
      },
    });

    const stored = dbMock.integration.create.mock.calls[0]?.[0].data.config;
    expect(stored.secretAccessKey).toMatch(/^enc:/);
    expect(stored.secretAccessKey).not.toContain('plaintext-secret');

    expect(JSON.stringify(result)).not.toContain('plaintext-secret');
    expect(leakedSecrets(result)).toEqual([]);
    expect(result.config).toMatchObject({
      type: 's3_export',
      accessKeyId: 'AKIA',
      secretAccessKey: '',
    });
  });
});
