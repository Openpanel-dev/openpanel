// Project creation: one write client for the SDKs and one read client for MCP,
// whose token is the only thing the caller ever sees of it.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';

interface CreateArgs {
  data: Record<string, unknown>;
}

const clientCreate = mock(async ({ data }: CreateArgs) => ({
  id: `client_${String(data.type)}`,
  ...data,
}));
const dbMock = {
  organization: {
    create: mock(async ({ data }: CreateArgs) => ({ ...data })),
  },
  member: { create: mock(async () => ({})) },
  project: { create: mock(async ({ data }: CreateArgs) => ({ ...data })) },
  client: { create: clientCreate },
  $transaction: mock((operations: Promise<unknown>[]) =>
    Promise.all(operations)
  ),
};
const deps = {
  db: dbMock,
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

const realSlugId = { ...(await import('../../slug-id')) };
mock.module('../../slug-id', () => ({
  ...realSlugId,
  getId: mock(async (_deps: unknown, _table: string, name: string) =>
    name.toLowerCase().replace(/\s+/g, '-')
  ),
}));
const realUserService = { ...(await import('../user/user.service')) };
mock.module('../user/user.service', () => ({
  ...realUserService,
  getUserById: mock(async () => ({ email: 'ada@example.com' })),
}));

afterAll(() => {
  mock.module('../../slug-id', () => realSlugId);
  mock.module('../user/user.service', () => realUserService);
});

let createOnboardingProject: typeof import('./onboarding.service').createOnboardingProject;

beforeAll(async () => {
  ({ createOnboardingProject } = await import('./onboarding.service'));
});

test('creates a write client for events and a read client whose token works for MCP', async () => {
  const result = await createOnboardingProject(
    deps,
    {
      organization: 'Acme',
      project: 'Acme site',
      domain: 'https://acme.com',
      cors: [],
      website: true,
      app: false,
      backend: false,
    },
    'user_1'
  );

  expect(clientCreate).toHaveBeenCalledTimes(2);
  const created = clientCreate.mock.calls.map(([call]) => call.data);
  expect(created.map((data) => data.type)).toEqual(['write', 'read']);
  expect(created.map((data) => data.name)).toEqual([
    'Acme site Client',
    'Acme site MCP client',
  ]);
  expect(created.every((data) => data.projectId === 'acme-site')).toBe(true);

  expect(result.type).toBe('write');
  expect(result.secret).toMatch(/^sec_[0-9a-f]{20}$/);
  const decoded = Buffer.from(result.mcpToken, 'base64').toString();
  expect(decoded).toMatch(/^client_read:sec_[0-9a-f]{20}$/);
  // Its own secret, never the write client's.
  expect(decoded.endsWith(result.secret)).toBe(false);
});
