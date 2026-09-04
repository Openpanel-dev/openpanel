// salt.service.ts's db access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: the
// mock is registered before the subject's first call, not before its
// (side-effect-free) import.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';

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

const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
  db: { salt: saltDelegate, $transaction },
}));

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

let subject: typeof import('./salt.service');
beforeAll(async () => {
  subject = await import('./salt.service');
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

// `fetchSalts` is the uncached read `getSalts` wraps — asserted directly
// rather than through `getSalts` itself, because `getSalts`'s `cacheable(...)`
// wrapping is bound at this module's first-ever evaluation, which a bare
// (non `--isolate`) `bun test` run does not let this file control (see the
// module header). `createInitialSalts`'s own tests above already exercise
// the same "does a salt exist" branch through the production call path.
test('fetchSalts returns current + previous, newest first', async () => {
  resetStore([
    { salt: 'older', createdAt: new Date('2024-01-01T00:00:00Z') },
    { salt: 'newer', createdAt: new Date('2024-01-02T00:00:00Z') },
  ]);

  await expect(subject.fetchSalts()).resolves.toEqual({
    current: 'newer',
    previous: 'older',
  });
});

test('fetchSalts falls back previous to current when only one salt exists', async () => {
  resetStore([{ salt: 'only-one', createdAt: new Date() }]);

  await expect(subject.fetchSalts()).resolves.toEqual({
    current: 'only-one',
    previous: 'only-one',
  });
});

test('fetchSalts throws when the table is empty', async () => {
  resetStore([]);

  await expect(subject.fetchSalts()).rejects.toThrow('No salt found');
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
