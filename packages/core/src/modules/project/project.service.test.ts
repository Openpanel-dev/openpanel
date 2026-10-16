// The subject is built over a fake `ServiceDeps`, so `deps.db` IS the fake below and
// Postgres needs no module mock. The ClickHouse readers (`getProjectEventsCount`,
// `getLastEventPerProject`) are not covered here.
//
// Create/update invalidate a project's clients through `client.service.ts`'s
// module-scope `getClientByIdCached`, built from the `cacheable` stub below.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeProject {
  id: string;
  organizationId: string;
  name: string;
  domain: string | null;
  cors: string[];
  crossDomain: boolean;
  allowUnsafeRevenueTracking: boolean;
  types: string[];
  filters: unknown[];
  eventsCount: number;
  firstEventAt: Date | null;
  createdAt: Date;
  deleteAt: Date | null;
}

interface FakeClient {
  id: string;
  projectId: string;
}

const projectStore = new Map<string, FakeProject>();
const clientsByProject = new Map<string, FakeClient[]>();
const reportCountByProject = new Map<string, number>();
const memberCountByOrg = new Map<string, number>();
const organizationDeleteAtById = new Map<string, Date | null>();

function makeProject(
  overrides: Partial<FakeProject> & { id: string; organizationId: string }
): FakeProject {
  return {
    name: 'A project',
    domain: null,
    cors: [],
    crossDomain: false,
    allowUnsafeRevenueTracking: false,
    types: [],
    filters: [],
    eventsCount: 0,
    firstEventAt: null,
    createdAt: new Date(),
    deleteAt: null,
    ...overrides,
  };
}

const project = {
  findMany: mock(
    async ({ where }: { where: { organizationId: string; deleteAt?: null } }) =>
      [...projectStore.values()].filter(
        (p) => p.organizationId === where.organizationId && !p.deleteAt
      )
  ),
  findFirst: mock(
    async ({ where }: { where: { id: string; organizationId: string } }) => {
      const found = projectStore.get(where.id);
      if (!found || found.organizationId !== where.organizationId) {
        return null;
      }
      return { ...found, clients: clientsByProject.get(where.id) ?? [] };
    }
  ),
  findUnique: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const found = projectStore.get(id);
    if (!found) {
      return null;
    }
    return {
      ...found,
      organization: { deleteAt: organizationDeleteAtById.get(id) ?? null },
    };
  }),
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = projectStore.get(id);
      if (!found) {
        throw new Error(`project ${id} not found`);
      }
      return {
        ...found,
        organization: { deleteAt: organizationDeleteAtById.get(id) ?? null },
      };
    }
  ),
  create: mock(
    async ({
      data,
    }: {
      data: Omit<FakeProject, 'id' | 'createdAt'> & { id: string };
    }) => {
      const created = makeProject(data);
      projectStore.set(created.id, created);
      const client = { id: `client_${created.id}`, projectId: created.id };
      clientsByProject.set(created.id, [client]);
      return { ...created, clients: [{ id: client.id }] };
    }
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeProject>;
    }) => {
      const existing = projectStore.get(id);
      if (!existing) {
        throw new Error(`project ${id} not found`);
      }
      const next = { ...existing, ...data };
      projectStore.set(id, next);
      return next;
    }
  ),
};

const report = {
  count: mock(
    async ({ where: { projectId } }: { where: { projectId: string } }) =>
      reportCountByProject.get(projectId) ?? 0
  ),
};

const member = {
  count: mock(
    async ({
      where: { organizationId },
    }: {
      where: { organizationId: string };
    }) => memberCountByOrg.get(organizationId) ?? 0
  ),
};

// Bypasses the Redis cache-aside: this module's own logic is exercised directly.
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
// Each factory spreads a plain-object SNAPSHOT of the real module and is
// restored in afterAll. `mock.module` has no per-file scope under bare `bun
// test`, and a partial factory for `@openpanel/redis` deletes every export it
// does not name for whichever file runs next.
const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  cacheable: cacheableStub,
  getRedisCache: () => ({
    get: async () => null,
    setex: async () => undefined,
    del: async () => undefined,
  }),
}));

const realSlugId = { ...(await import('../../slug-id')) };
mock.module('../../slug-id', () => ({
  ...realSlugId,
  getId: async (_deps: unknown, _table: string, name: string) => `${name}-slug`,
}));

afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
  mock.module('../../slug-id', () => realSlugId);
});

let subject: ReturnType<
  typeof import('./project.service').createProjectService
>;
beforeAll(async () => {
  const { createProjectService } = await import('./project.service');
  subject = createProjectService(
    {
      db: { project, report, member },
    } as unknown as import('../../services').ServiceDeps,
    testServices()
  );
});

beforeEach(() => {
  projectStore.clear();
  clientsByProject.clear();
  reportCountByProject.clear();
  memberCountByOrg.clear();
  organizationDeleteAtById.clear();
});

test('listProjectsForOrganization excludes soft-deleted projects and other orgs', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));
  projectStore.set(
    'p2',
    makeProject({ id: 'p2', organizationId: 'org_1', deleteAt: new Date() })
  );
  projectStore.set('p3', makeProject({ id: 'p3', organizationId: 'org_2' }));

  const result = await subject.listProjectsForOrganization('org_1');
  expect(result.map((p) => p.id)).toEqual(['p1']);
});

test('getProjectForOrganization returns null for a project in a different org', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));

  const result = await subject.getProjectForOrganization('p1', 'org_2');
  expect(result).toBeNull();
});

test('createProjectForOrganization creates a project with a first write client', async () => {
  const result = await subject.createProjectForOrganization('org_1', {
    name: 'New project',
    cors: ['https://example.com'],
    crossDomain: false,
    types: [],
  });

  expect(result.project.organizationId).toBe('org_1');
  expect(result.client).not.toBeNull();
  expect(typeof result.client?.secret).toBe('string');
});

test('updateProjectForOrganization returns null for a project in a different org', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));

  const result = await subject.updateProjectForOrganization('p1', 'org_2', {
    name: 'Renamed',
  });
  expect(result).toBeNull();
});

test('updateProjectForOrganization strips trailing slashes from domain and cors', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));

  const result = await subject.updateProjectForOrganization('p1', 'org_1', {
    domain: 'https://example.com/',
    cors: ['https://a.com/', 'https://b.com/'],
  });

  expect(result?.domain).toBe('https://example.com');
  expect(result?.cors).toEqual(['https://a.com', 'https://b.com']);
});

test('updateProjectForOrganization persists exclude filters', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));
  const filters = [
    { type: 'ip' as const, ip: '203.0.113.7' },
    { type: 'profile_id' as const, profileId: 'usr_1' },
  ];

  const result = await subject.updateProjectForOrganization('p1', 'org_1', {
    filters,
  });

  expect(result?.filters).toEqual(filters);
  expect(projectStore.get('p1')?.filters).toEqual(filters);
});

test('updateProjectForOrganization leaves filters unchanged when omitted', async () => {
  const filters = [{ type: 'ip', ip: '203.0.113.7' }];
  projectStore.set(
    'p1',
    makeProject({ id: 'p1', organizationId: 'org_1', filters })
  );

  await subject.updateProjectForOrganization('p1', 'org_1', {
    name: 'Renamed',
  });

  expect(projectStore.get('p1')?.filters).toEqual(filters);
});

test('deleteProjectForOrganization schedules a 24h grace period, scoped to the org', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));

  const denied = await subject.deleteProjectForOrganization('p1', 'org_2');
  expect(denied).toBe(false);

  const before = Date.now();
  const result = await subject.deleteProjectForOrganization('p1', 'org_1');
  expect(result).toBe(true);

  const updated = projectStore.get('p1');
  expect(updated?.deleteAt).not.toBeNull();
  const deleteAtMs = updated?.deleteAt?.getTime() ?? 0;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  expect(deleteAtMs).toBeGreaterThanOrEqual(before + TWENTY_FOUR_HOURS_MS);
});

test('scheduleProjectDeletion sets deleteAt ~24h out', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));

  const before = Date.now();
  await subject.scheduleProjectDeletion('p1');

  const updated = projectStore.get('p1');
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  expect(updated?.deleteAt?.getTime()).toBeGreaterThanOrEqual(
    before + TWENTY_FOUR_HOURS_MS
  );
});

test('cancelProjectDeletion refuses while the organization itself is scheduled for deletion', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));
  organizationDeleteAtById.set('p1', new Date());

  await expect(subject.cancelProjectDeletion('p1')).rejects.toThrow(
    /organization is scheduled for deletion/
  );
});

test('cancelProjectDeletion clears deleteAt otherwise', async () => {
  projectStore.set(
    'p1',
    makeProject({ id: 'p1', organizationId: 'org_1', deleteAt: new Date() })
  );

  await subject.cancelProjectDeletion('p1');
  expect(projectStore.get('p1')?.deleteAt).toBeNull();
});

test('getProjectActivationStatus reports hasReport/hasTeammate from counts', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));
  reportCountByProject.set('p1', 2);
  memberCountByOrg.set('org_1', 3);

  const status = await subject.getProjectActivationStatus('p1');
  expect(status.hasReport).toBe(true);
  expect(status.hasTeammate).toBe(true);
});

test('getProjectActivationStatus is false when there is no report and no extra teammate', async () => {
  projectStore.set('p1', makeProject({ id: 'p1', organizationId: 'org_1' }));
  memberCountByOrg.set('org_1', 1);

  const status = await subject.getProjectActivationStatus('p1');
  expect(status.hasReport).toBe(false);
  expect(status.hasTeammate).toBe(false);
});
