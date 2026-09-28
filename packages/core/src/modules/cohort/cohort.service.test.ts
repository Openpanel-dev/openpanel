// Every function under test takes `ServiceDeps`, so `deps.db` and `deps.ch` ARE
// the fakes below — the two `@openpanel/db` module mocks this file used to
// install (and had to carefully restore, because `mock.module` has no per-file
// scope without `--isolate`) are gone. The one module still mocked is core's
// own `ch-query`, which is what the subject now calls.
//
// The pure SQL-shape builders (buildEventCriteriaQuery,
// buildPropertyBasedCohortQuery, deriveCohortQuerySettings) have their own
// file, src/cohort-sql.test.ts, and need none of this — they take no ClickHouse
// connection.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { testServices } from '../../../test/service-deps';

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

const chQuery = mock(async () => [] as unknown[]);
const chInsert = mock(async (_args: { table: string }) => undefined);
const chCommand = mock(async (_args: { query: string }) => undefined);

// The subject reaches ClickHouse through core's own `chQuery(deps, ...)`
// (ch-query.ts) — mocking that one module keeps this file off
// @openpanel/db's live-bound client singleton entirely. `mock.module` still
// has no per-file scope under bare `bun test` (AGENTS.md), so snapshot the
// real module into a plain object FIRST and restore it in afterAll —
// restoring via the live import binding would just re-apply the mock.
const realChQuery = { ...(await import('../../ch-query')) };
mock.module('../../ch-query', () => ({
  ...realChQuery,
  chQuery: (_deps: unknown, ...args: unknown[]) => chQuery(...(args as [])),
}));

afterAll(() => {
  mock.module('../../ch-query', () => realChQuery);
});

const deps = {
  db: { cohort },
  ch: { insert: chInsert, command: chCommand },
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

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

  await subject.updateCohortMembership(deps, 'cohort_1');

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

  await subject.updateCohortMembership(deps, 'missing');

  expect(chCommand).not.toHaveBeenCalled();
});

test('deleteCohortMembership clears both cohort_members and cohort_metadata', async () => {
  chCommand.mockClear();

  await subject.deleteCohortMembership(deps, 'cohort_1', 'proj_1');

  expect(chCommand).toHaveBeenCalledTimes(2);
});

test('listRefreshableCohortIds returns only non-static cohorts', async () => {
  cohortStore.clear();
  seedCohort({ id: 'c1', isStatic: false });
  seedCohort({ id: 'c2', isStatic: true });
  seedCohort({ id: 'c3', isStatic: false });

  const ids = await subject.listRefreshableCohortIds(deps);

  expect(ids.sort()).toEqual(['c1', 'c3']);
});

test('getCohortCount serves the cached profileCount within 15 minutes', async () => {
  cohortStore.clear();
  chQuery.mockClear();
  seedCohort({
    profileCount: 42,
    lastComputedAt: new Date(Date.now() - 60_000),
  });

  const count = await subject.getCohortCount(deps, 'cohort_1', 'proj_1');

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

  const count = await subject.getCohortCount(deps, 'cohort_1', 'proj_1');

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

  await subject
    .createCohortService(deps, testServices())
    .enqueueCompute('cohort_1');

  expect(addCalls).toEqual([
    {
      payload: { cohortId: 'cohort_1' },
      options: { deduplicationId: 'cohort-cohort_1' },
    },
  ]);
});

test('createCohortService() delegates updateMembership and listRefreshableCohortIds to the plain functions, over its own deps', async () => {
  cohortStore.clear();
  seedCohort({ id: 'c1', isStatic: false });
  seedCohort({ id: 'c2', isStatic: true });
  const service = subject.createCohortService(deps, testServices());

  // The container's members are closures over `deps`, not the bare functions,
  // so identity is no longer the observable — delegation is.
  expect((await service.listRefreshableCohortIds()).sort()).toEqual(['c1']);

  chCommand.mockClear();
  await service.updateMembership('missing');
  expect(chCommand).not.toHaveBeenCalled();
});
