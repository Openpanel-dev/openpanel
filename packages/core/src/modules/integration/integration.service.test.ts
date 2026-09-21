// Credentials are write-only (see src/registry.ts): every path that hands an
// integration row to a client must go through `redactIntegration`. These pin
// the read paths AND the mutation return values — a create/update that echoes
// the stored row is how a webhook's Authorization header reached the client.
//
// Access is a real `getAccessChecks()` over faked lookups, the same seam
// auth.service.access.test.ts uses; storage is an in-memory fake `deps.db`.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';

interface FakeIntegration {
  id: string;
  name: string;
  projectId: string | null;
  organizationId: string;
  config: Record<string, unknown>;
}

const integrationStore = new Map<string, FakeIntegration>();

let projectAccessLevel: 'read' | 'write' | 'admin' | null = 'write';

const realAccessLookups = { ...(await import('../../shared/access-lookups')) };
mock.module('../../shared/access-lookups', () => ({
  ...realAccessLookups,
  getProjectAccess: mock(async () =>
    projectAccessLevel ? { level: projectAccessLevel } : null
  ),
  getOrganizationAccess: mock(async () => ({ role: 'org:member' })),
  canWriteProject: (access: { level: string } | null) =>
    !!access && (access.level === 'write' || access.level === 'admin'),
  getProjectById: mock(async () => ({ organizationId: 'org_1' })),
}));

const integration = {
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = integrationStore.get(id);
      if (!found) {
        throw new Error(`integration ${id} not found`);
      }
      return found;
    }
  ),
  findMany: mock(async () => [...integrationStore.values()]),
  create: mock(async ({ data }: { data: Omit<FakeIntegration, 'id'> }) => {
    const row = { id: `int_${integrationStore.size + 1}`, ...data };
    integrationStore.set(row.id, row);
    return row;
  }),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeIntegration>;
    }) => {
      const existing = integrationStore.get(id);
      if (!existing) {
        throw new Error(`integration ${id} not found`);
      }
      const next = { ...existing, ...data };
      integrationStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const existing = integrationStore.get(id);
    integrationStore.delete(id);
    return existing;
  }),
};

const project = {
  findUniqueOrThrow: mock(async () => ({ organizationId: 'org_1' })),
};

const deps = {
  db: { integration, project },
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

let subject: typeof import('./integration.service');
let resetAccessChecksForTests: typeof import('../auth/auth.service').resetAccessChecksForTests;
beforeAll(async () => {
  ({ resetAccessChecksForTests } = await import('../auth/auth.service'));
  resetAccessChecksForTests();
  subject = await import('./integration.service');
});

afterAll(() => {
  mock.module('../../shared/access-lookups', () => realAccessLookups);
  resetAccessChecksForTests();
});

beforeEach(() => {
  integrationStore.clear();
  projectAccessLevel = 'write';
});

const WEBHOOK_HEADERS = {
  Authorization: 'Bearer very-secret',
  'X-Trace': 'not-secret-but-a-header-value',
};

function storeWebhook(id = 'int_1'): FakeIntegration {
  const row: FakeIntegration = {
    id,
    name: 'Hook',
    projectId: 'proj_1',
    organizationId: 'org_1',
    config: {
      type: 'webhook',
      url: 'https://example.com/hook',
      headers: WEBHOOK_HEADERS,
      mode: 'message',
    },
  };
  integrationStore.set(id, row);
  return row;
}

function storeSlack(id = 'int_slack'): FakeIntegration {
  const row: FakeIntegration = {
    id,
    name: 'Slack',
    projectId: 'proj_1',
    organizationId: 'org_1',
    config: {
      type: 'slack',
      access_token: 'xoxb-secret',
      incoming_webhook: { url: 'https://hooks.slack.com/T/B/secret' },
    },
  };
  integrationStore.set(id, row);
  return row;
}

test('list returns no credential values to a read-level project member', async () => {
  storeWebhook();
  storeSlack();
  projectAccessLevel = 'read';

  const rows = await subject.listIntegrationsForProject(deps, 'u1', 'proj_1');
  const serialized = JSON.stringify(rows);

  expect(serialized).not.toContain('very-secret');
  expect(serialized).not.toContain('xoxb-secret');
  expect(serialized).not.toContain('/T/B/secret');
  // Non-secret config the dashboard renders survives; header KEYS stay so the
  // form shows which headers are configured.
  const hook = rows.find((row) => row.id === 'int_1');
  expect(hook?.config).toMatchObject({
    type: 'webhook',
    url: 'https://example.com/hook',
    headers: { Authorization: '', 'X-Trace': '' },
  });
});

test('get returns no credential values', async () => {
  storeSlack();
  projectAccessLevel = 'read';

  const row = await subject.getIntegrationById(deps, 'u1', 'int_slack');

  expect(JSON.stringify(row)).not.toContain('xoxb-secret');
  expect(row.config).toMatchObject({ type: 'slack', access_token: '' });
});

test('createOrUpdate does not echo the submitted header values back', async () => {
  const row = await subject.upsertIntegration(deps, 'u1', {
    name: 'Hook',
    projectId: 'proj_1',
    config: {
      type: 'webhook',
      url: 'https://example.com/hook',
      headers: WEBHOOK_HEADERS,
      mode: 'message',
    },
  });

  expect(JSON.stringify(row)).not.toContain('very-secret');
  expect(row.config).toMatchObject({
    headers: { Authorization: '', 'X-Trace': '' },
  });
  // ...while the stored row keeps them for delivery.
  expect(integrationStore.get(row.id)?.config).toMatchObject({
    headers: WEBHOOK_HEADERS,
  });
});

test('createOrUpdate keeps stored header values when the form submits them blank, without echoing them', async () => {
  storeWebhook();

  const row = await subject.upsertIntegration(deps, 'u1', {
    id: 'int_1',
    name: 'Hook renamed',
    projectId: 'proj_1',
    config: {
      type: 'webhook',
      url: 'https://example.com/hook',
      headers: { Authorization: '', 'X-Trace': '' },
      mode: 'message',
    },
  });

  expect(row.name).toBe('Hook renamed');
  expect(JSON.stringify(row)).not.toContain('very-secret');
  expect(integrationStore.get('int_1')?.config).toMatchObject({
    headers: WEBHOOK_HEADERS,
  });
});

test('delete returns only the id, not the deleted row', async () => {
  storeWebhook();

  const result = await subject.deleteIntegration(deps, 'u1', 'int_1');

  expect(result).toEqual({ id: 'int_1' });
  expect(integrationStore.has('int_1')).toBe(false);
});
