// cohort.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.
//
// The pure SQL-shape builders (buildEventCriteriaQuery,
// buildPropertyBasedCohortQuery, deriveCohortQuerySettings) have their own
// file, src/cohort-sql.test.ts, and need none of this — they take no
// ClickHouse connection.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';

interface FakeCohort {
  id: string;
  projectId: string;
  name: string;
  definition: unknown;
  isStatic: boolean;
  profileCount: number;
  lastComputedAt: Date | null;
}

const cohortStore = new Map<string, FakeCohort>();

const cohort = {
  findUnique: mock(
    async ({ where: { id } }: { where: { id: string } }) =>
      cohortStore.get(id) ?? null
  ),
  findMany: mock(async ({ where }: { where?: { isStatic?: boolean } } = {}) =>
    [...cohortStore.values()].filter(
      (c) => where?.isStatic === undefined || c.isStatic === where.isStatic
    )
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeCohort>;
    }) => {
      const existing = cohortStore.get(id);
      if (!existing) {
        throw new Error(`cohort ${id} not found`);
      }
      const updated = { ...existing, ...data };
      cohortStore.set(id, updated);
      return updated;
    }
  ),
};

const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
  db: { cohort },
}));

const chQuery = mock(async () => [] as unknown[]);
const chInsert = mock(async (_args: { table: string }) => undefined);
const chCommand = mock(async (_args: { query: string }) => undefined);
const getReplicatedTableName = mock((table: string) => table);
// Spread the real module rather than hand-listing every export: `mock.module`
// replaces this specifier process-wide (bun runs every test file in one
// shared module registry without `--isolate` — see AGENTS.md), so a partial
// factory here silently breaks unrelated consumers (gsc/insight/import tests
// and now the mcp module's) that import an export this file never overrides.
// `ch` itself is one such export: only `insert`/`command` are what
// cohort.service.ts exercises, so those two are overridden and every other
// method (`query`, ...) is spread from the real client — a bare `{ insert,
// command }` replacement previously stripped `query` from every *other*
// consumer of this same live-bound singleton (e.g. `@openpanel/db`'s
// `OverviewService`/`PagesService`, constructed once at that module's own
// load time) for the rest of the process.
// A plain-object snapshot, not the live import binding: once `mock.module`
// below swaps this specifier, `actualClickhouseClient.chQuery` (a namespace
// binding) reflects the *mocked* value too, so restoring via
// `actualClickhouseClient` itself in `afterAll` is a no-op — it just spreads
// back whatever is currently mocked. Snapshotting into a plain object first
// keeps a real, frozen-in-time copy to restore to.
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);
const realClickhouseClient = { ...actualClickhouseClient };
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ...realClickhouseClient,
  ch: { ...realClickhouseClient.ch, insert: chInsert, command: chCommand },
  chQuery,
  getReplicatedTableName,
}));

// `chQuery`/`ch.insert`/`ch.command` above are fakes stuck in place for the
// rest of the process once this file's tests finish (`mock.module` has no
// per-file scope without `--isolate` — see AGENTS.md): the mcp module's
// integration suite calls the real `chQuery` against a live ClickHouse and
// silently got `[]` back from this file's leftover mock. Restore the real
// snapshot so whichever file runs next sees real behavior again.
afterAll(() => {
  mock.module(
    '@openpanel/db/src/clickhouse/client',
    () => realClickhouseClient
  );
});

let subject: typeof import('./cohort.service');
beforeAll(async () => {
  subject = await import('./cohort.service');
});

function seedCohort(overrides: Partial<FakeCohort> = {}): FakeCohort {
  const seeded: FakeCohort = {
    id: 'cohort_1',
    projectId: 'proj_1',
    name: 'Power users',
    definition: {
      type: 'property',
      criteria: {
        operator: 'and',
        properties: [
          { name: 'profile.email', operator: 'isNotNull', value: [] },
        ],
      },
    },
    isStatic: false,
    profileCount: 0,
    lastComputedAt: null,
    ...overrides,
  };
  cohortStore.set(seeded.id, seeded);
  return seeded;
}

test('updateCohortMembership computes, clears old membership, stores new membership', async () => {
  cohortStore.clear();
  chQuery.mockClear();
  chInsert.mockClear();
  chCommand.mockClear();
  seedCohort();
  chQuery.mockImplementationOnce(async () => [{ profile_id: 'p1' }]);

  await subject.updateCohortMembership('cohort_1');

  expect(chCommand).toHaveBeenCalledTimes(1);
  expect(chCommand.mock.calls[0]?.[0]?.query).toContain('DELETE FROM');
  expect(chInsert).toHaveBeenCalledTimes(2); // cohort_members + cohort_metadata
  const updated = cohortStore.get('cohort_1');
  expect(updated?.profileCount).toBe(1);
  expect(updated?.lastComputedAt).toBeInstanceOf(Date);
});

test('updateCohortMembership does nothing when the cohort no longer exists', async () => {
  cohortStore.clear();
  chCommand.mockClear();

  await subject.updateCohortMembership('missing');

  expect(chCommand).not.toHaveBeenCalled();
});

test('deleteCohortMembership clears both cohort_members and cohort_metadata', async () => {
  chCommand.mockClear();

  await subject.deleteCohortMembership('cohort_1', 'proj_1');

  expect(chCommand).toHaveBeenCalledTimes(2);
});

test('listRefreshableCohortIds returns only non-static cohorts', async () => {
  cohortStore.clear();
  seedCohort({ id: 'c1', isStatic: false });
  seedCohort({ id: 'c2', isStatic: true });
  seedCohort({ id: 'c3', isStatic: false });

  const ids = await subject.listRefreshableCohortIds();

  expect(ids.sort()).toEqual(['c1', 'c3']);
});

test('getCohortCount serves the cached profileCount within 15 minutes', async () => {
  cohortStore.clear();
  chQuery.mockClear();
  seedCohort({
    profileCount: 42,
    lastComputedAt: new Date(Date.now() - 60_000),
  });

  const count = await subject.getCohortCount('cohort_1', 'proj_1');

  expect(count).toBe(42);
  expect(chQuery).not.toHaveBeenCalled();
});

test('getCohortCount re-queries ClickHouse once the cache is stale', async () => {
  cohortStore.clear();
  chQuery.mockClear();
  seedCohort({
    profileCount: 42,
    lastComputedAt: new Date(Date.now() - 16 * 60 * 1000),
  });
  chQuery.mockImplementationOnce(async () => [{ count: 7 }]);

  const count = await subject.getCohortCount('cohort_1', 'proj_1');

  expect(count).toBe(7);
  expect(chQuery).toHaveBeenCalledTimes(1);
});

test('createCohortService().enqueueCompute enqueues with the cohort-<id> deduplication key, not a jobId', async () => {
  const addCalls: { payload: unknown; options: unknown }[] = [];
  const deps = {
    queues: {
      cohortCompute: {
        cohortCompute: {
          add: async (payload: unknown, options?: unknown) => {
            addCalls.push({ payload, options });
            return 'job_1';
          },
          remove: async () => undefined,
        },
      },
    },
  } as unknown as Parameters<typeof subject.createCohortService>[0];

  await subject.createCohortService(deps).enqueueCompute('cohort_1');

  expect(addCalls).toEqual([
    {
      payload: { cohortId: 'cohort_1' },
      options: { deduplicationId: 'cohort-cohort_1' },
    },
  ]);
});

test('createCohortService() binds updateMembership and listRefreshableCohortIds to the plain functions', () => {
  const deps = {
    queues: {},
  } as unknown as Parameters<typeof subject.createCohortService>[0];
  const service = subject.createCohortService(deps);

  expect(service.updateMembership).toBe(subject.updateCohortMembership);
  expect(service.listRefreshableCohortIds).toBe(
    subject.listRefreshableCohortIds
  );
});
