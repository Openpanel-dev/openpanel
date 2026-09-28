// The subject is built by its factory over a fake `ServiceDeps`, so Postgres
// needs no module mock at all — `deps.db` IS the fake below, same idiom as
// reference.service.test.ts. `@openpanel/redis` is still stubbed:
// `getClientByIdCached` calls `cacheable(...)` inside `createClientService`
// itself now (not at this module's import time), but the binding is resolved at
// `client.service.ts`'s own import time, so the mock must still land before
// that import — hence the `await import` in `beforeAll`.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeProject {
  id: string;
  organizationId: string;
}

interface FakeClient {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  type: 'read' | 'write' | 'root';
  secret: string;
  createdAt: Date;
}

const projectStore = new Map<string, FakeProject>();
const clientStore = new Map<string, FakeClient>();
let nextClientId = 0;

function makeClient(
  overrides: Partial<FakeClient> & { id: string }
): FakeClient {
  return {
    organizationId: 'org_1',
    projectId: null,
    name: 'A client',
    type: 'write',
    secret: 'hashed',
    createdAt: new Date(),
    ...overrides,
  };
}

const project = {
  findFirst: mock(
    async ({ where }: { where: { id: string; organizationId: string } }) => {
      const found = projectStore.get(where.id);
      if (!found || found.organizationId !== where.organizationId) {
        return null;
      }
      return found;
    }
  ),
};

const client = {
  findMany: mock(
    async ({
      where,
    }: {
      where: { organizationId: string; projectId?: string };
    }) =>
      [...clientStore.values()].filter(
        (c) =>
          c.organizationId === where.organizationId &&
          (where.projectId === undefined || c.projectId === where.projectId)
      )
  ),
  findFirst: mock(
    async ({ where }: { where: { id: string; organizationId: string } }) => {
      const found = clientStore.get(where.id);
      if (!found || found.organizationId !== where.organizationId) {
        return null;
      }
      return found;
    }
  ),
  findUnique: mock(async ({ where: { id } }: { where: { id: string } }) => {
    return clientStore.get(id) ?? null;
  }),
  create: mock(
    async ({ data }: { data: Omit<FakeClient, 'id' | 'createdAt'> }) => {
      const created = makeClient({
        id: `client_${++nextClientId}`,
        ...data,
      });
      clientStore.set(created.id, created);
      return created;
    }
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeClient>;
    }) => {
      const existing = clientStore.get(id);
      if (!existing) {
        throw new Error(`client ${id} not found`);
      }
      const next = { ...existing, ...data };
      clientStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    clientStore.delete(id);
  }),
};

// Bypasses the Redis cache-aside entirely — this module's own logic is
// exercised directly, caching is @openpanel/redis's concern. Same stub as
// organization.service.test.ts, needed because create/update/delete all call
// `.clear()` on getClientByIdCached.
function cacheableStub(
  fnOrName: ((...args: unknown[]) => unknown) | string,
  fnOrTtl: ((...args: unknown[]) => unknown) | number
) {
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : (fnOrTtl as (...args: unknown[]) => unknown);
  return Object.assign(fn, {
    getKey: () => '',
    clear: async () => 0,
    set: () => async () => 'OK' as const,
  });
}
mock.module('@openpanel/redis', () => ({
  cacheable: cacheableStub,
  getRedisCache: () => ({
    get: async () => null,
    setex: async () => undefined,
    del: async () => undefined,
  }),
}));

let subject: ReturnType<typeof import('./client.service').createClientService>;
beforeAll(async () => {
  const { createClientService } = await import('./client.service');
  subject = createClientService(
    {
      db: { project, client },
    } as unknown as import('../../services').ServiceDeps,
    testServices()
  );
});

beforeEach(() => {
  projectStore.clear();
  clientStore.clear();
});

test('listClientsForOrganization returns null when the filtering project does not belong to the org', async () => {
  projectStore.set('proj_1', { id: 'proj_1', organizationId: 'org_other' });

  const result = await subject.listClientsForOrganization('org_1', 'proj_1');
  expect(result).toBeNull();
});

test('listClientsForOrganization scopes to the organization', async () => {
  clientStore.set(
    'client_a',
    makeClient({ id: 'client_a', organizationId: 'org_1' })
  );
  clientStore.set(
    'client_b',
    makeClient({ id: 'client_b', organizationId: 'org_2' })
  );

  const result = await subject.listClientsForOrganization('org_1');
  expect(result?.map((c) => c.id)).toEqual(['client_a']);
});

test('getClientForOrganization returns null for a client in a different org', async () => {
  clientStore.set(
    'client_a',
    makeClient({ id: 'client_a', organizationId: 'org_1' })
  );

  const result = await subject.getClientForOrganization('client_a', 'org_2');
  expect(result).toBeNull();
});

test('createClientForOrganization returns null when the projectId does not belong to the org', async () => {
  const result = await subject.createClientForOrganization('org_1', {
    name: 'New client',
    projectId: 'missing_project',
  });
  expect(result).toBeNull();
});

test('createClientForOrganization creates a write client and returns the plaintext secret once', async () => {
  const result = await subject.createClientForOrganization('org_1', {
    name: 'New client',
  });

  expect(result).not.toBeNull();
  expect(result?.client.type).toBe('write');
  expect(result?.client.secret).not.toBe(result?.secret);
  expect(typeof result?.secret).toBe('string');
});

test('updateClientForOrganization returns null for a client in a different org', async () => {
  clientStore.set(
    'client_a',
    makeClient({ id: 'client_a', organizationId: 'org_1' })
  );

  const result = await subject.updateClientForOrganization(
    'client_a',
    'org_2',
    { name: 'Renamed' }
  );
  expect(result).toBeNull();
});

test('updateClientForOrganization renames the client', async () => {
  clientStore.set(
    'client_a',
    makeClient({ id: 'client_a', organizationId: 'org_1', name: 'Old name' })
  );

  const result = await subject.updateClientForOrganization(
    'client_a',
    'org_1',
    { name: 'New name' }
  );
  expect(result?.name).toBe('New name');
});

test('deleteClientForOrganization deletes only when the client belongs to the org', async () => {
  clientStore.set(
    'client_a',
    makeClient({ id: 'client_a', organizationId: 'org_1' })
  );

  const deniedResult = await subject.deleteClientForOrganization(
    'client_a',
    'org_2'
  );
  expect(deniedResult).toBe(false);
  expect(clientStore.has('client_a')).toBe(true);

  const result = await subject.deleteClientForOrganization('client_a', 'org_1');
  expect(result).toBe(true);
  expect(clientStore.has('client_a')).toBe(false);
});

// The stored secret is a hash, and the published docs promise it is never
// retrievable after creation (docs/api/manage/clients.mdx). The fake Prisma
// above ignores `omit`, so these assert on what the service ASKED FOR rather
// than on the rows it got back.
const OMIT_SECRET = { secret: true };

test('every client read path asks Prisma to omit the secret', async () => {
  clientStore.set(
    'client_1',
    makeClient({ id: 'client_1', projectId: 'proj_1' })
  );

  client.findMany.mockClear();
  await subject.getClientsByProjectId('proj_1');
  await subject.getClientsByOrganizationId('org_1');
  await subject.listClientsForOrganization('org_1');
  expect(client.findMany).toHaveBeenCalledTimes(3);
  for (const call of client.findMany.mock.calls) {
    expect(call[0]).toMatchObject({ omit: OMIT_SECRET });
  }

  client.findFirst.mockClear();
  await subject.getClientForOrganization('client_1', 'org_1');
  expect(client.findFirst).toHaveBeenCalledTimes(1);
  expect(client.findFirst.mock.calls[0]?.[0]).toMatchObject({
    omit: OMIT_SECRET,
  });
});

test('updateClientForOrganization omits the secret from the row it returns', async () => {
  clientStore.set('client_1', makeClient({ id: 'client_1' }));

  client.update.mockClear();
  await subject.updateClientForOrganization('client_1', 'org_1', {
    name: 'renamed',
  });

  expect(client.update).toHaveBeenCalledTimes(1);
  expect(client.update.mock.calls[0]?.[0]).toMatchObject({
    omit: OMIT_SECRET,
  });
});

test('getClientById keeps the secret — client authentication verifies against it', async () => {
  clientStore.set('client_1', makeClient({ id: 'client_1' }));

  client.findUnique.mockClear();
  const found = await subject.getClientById('client_1');

  expect(client.findUnique).toHaveBeenCalledTimes(1);
  expect(client.findUnique.mock.calls[0]?.[0]).not.toHaveProperty('omit');
  expect(found?.secret).toBe('hashed');
});
