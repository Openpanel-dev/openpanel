// The subject is built over a fake `ServiceDeps`, so Postgres needs no module
// mock at all — `deps.db` IS the fake below, same idiom as
// reference.service.test.ts. `@openpanel/redis`'s `cacheable` is still stubbed
// (module-level `getSalts` binds it at this file's first import), so
// `rotateSalt`'s `getSalts.clear` never reaches a real Redis connection.
//
// `getSalts` itself stays untested here: it is bare (no `deps` argument)
// because ingest.service.ts's hot path calls it with none — see the module
// header — and its `cacheable(...)` wrapping binds at this module's first-ever
// evaluation, which a bare (non `--isolate`) `bun test` run does not let this
// file control. `fetchSalts` (the uncached read it wraps) is exercised directly
// instead.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeSalt {
  salt: string;
  createdAt: Date;
}

let saltStore: FakeSalt[] = [];

function resetStore(initial: FakeSalt[] = []): void {
  saltStore = [...initial];
}

function sortedByCreatedAtDesc(rows: FakeSalt[]): FakeSalt[] {
  return [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

const findMany = mock(
  async ({ take }: { orderBy?: unknown; take?: number } = {}) => {
    const sorted = sortedByCreatedAtDesc(saltStore);
    return typeof take === 'number' ? sorted.slice(0, take) : sorted;
  }
);

const create = mock(
  async ({ data }: { data: { salt: string; createdAt?: Date } }) => {
    const row: FakeSalt = {
      salt: data.salt,
      createdAt: data.createdAt ?? new Date(),
    };
    saltStore.push(row);
    return row;
  }
);

const deleteMany = mock(
  async ({ where }: { where: { salt: { notIn: string[] } } }) => {
    const keep = new Set(where.salt.notIn);
    const before = saltStore.length;
    saltStore = saltStore.filter((row) => keep.has(row.salt));
    return { count: before - saltStore.length };
  }
);

const saltDelegate = { findMany, create, deleteMany };

const $transaction = mock(
  async (fn: (tx: { salt: typeof saltDelegate }) => Promise<unknown>) =>
    fn({ salt: saltDelegate })
);

// Bypasses the Redis cache-aside entirely, same as organization.service.test.ts's
// `cacheableStub` — this module's own logic is exercised directly, caching is
// @openpanel/redis's concern. Only the `cacheable(name, fn, ttl)` overload
// salt.service.ts uses needs covering.
function cacheableStub<T extends (...args: unknown[]) => unknown>(
  _name: string,
  fn: T,
  _ttl: number
) {
  return Object.assign(fn, {
    getKey: () => '',
    clear: async () => 0,
    set: () => async () => 'OK' as const,
  });
}

const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  cacheable: cacheableStub,
}));

afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
});

let subject: ReturnType<typeof import('./salt.service').createSaltService>;
let fetchSalts: typeof import('./salt.service').fetchSalts;
beforeAll(async () => {
  const mod = await import('./salt.service');
  fetchSalts = mod.fetchSalts;
  const deps = {
    db: { salt: saltDelegate, $transaction },
  } as unknown as import('../../services').ServiceDeps;
  subject = mod.createSaltService(deps, testServices());
});

beforeEach(() => {
  resetStore();
});

test('createInitialSalts creates two salts when none exist, backdating the older one', async () => {
  await subject.createInitialSalts();

  expect(saltStore).toHaveLength(2);
  const [older, newer] = sortedByCreatedAtDesc(saltStore).reverse();
  expect(newer?.createdAt.getTime()).toBeGreaterThan(
    older?.createdAt.getTime() ?? Number.NaN
  );
});

test('createInitialSalts is a no-op once a salt already exists', async () => {
  resetStore([{ salt: 'existing', createdAt: new Date() }]);

  await subject.createInitialSalts();

  expect(saltStore).toHaveLength(1);
  expect(saltStore[0]?.salt).toBe('existing');
});

test('fetchSalts returns current + previous, newest first', async () => {
  resetStore([
    { salt: 'older', createdAt: new Date('2024-01-01T00:00:00Z') },
    { salt: 'newer', createdAt: new Date('2024-01-02T00:00:00Z') },
  ]);

  await expect(
    fetchSalts({
      db: { salt: saltDelegate },
    } as unknown as import('../../services').ServiceDeps)
  ).resolves.toEqual({
    current: 'newer',
    previous: 'older',
  });
});

test('fetchSalts falls back previous to current when only one salt exists', async () => {
  resetStore([{ salt: 'only-one', createdAt: new Date() }]);

  await expect(
    fetchSalts({
      db: { salt: saltDelegate },
    } as unknown as import('../../services').ServiceDeps)
  ).resolves.toEqual({
    current: 'only-one',
    previous: 'only-one',
  });
});

test('fetchSalts throws when the table is empty', async () => {
  resetStore([]);

  await expect(
    fetchSalts({
      db: { salt: saltDelegate },
    } as unknown as import('../../services').ServiceDeps)
  ).rejects.toThrow('No salt found');
});

test('rotateSalt adds a salt and prunes everything except it and the previous newest', async () => {
  resetStore([
    { salt: 'oldest', createdAt: new Date('2024-01-01T00:00:00Z') },
    { salt: 'newest', createdAt: new Date('2024-01-02T00:00:00Z') },
  ]);

  const created = await subject.rotateSalt();

  expect(saltStore.map((row) => row.salt).sort()).toEqual(
    [created.salt, 'newest'].sort()
  );
});

test('rotateSalt keeps only the new salt when none existed before', async () => {
  resetStore([]);

  const created = await subject.rotateSalt();

  expect(saltStore.map((row) => row.salt)).toEqual([created.salt]);
});
