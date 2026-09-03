// reference.service.ts's db access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';

interface FakeReference {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  date: Date;
}

const referenceStore = new Map<string, FakeReference>();

function makeReference(
  overrides: Partial<FakeReference> & { id: string }
): FakeReference {
  return {
    title: 'Launch',
    description: null,
    projectId: 'proj_1',
    date: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  };
}

const reference = {
  findUnique: mock(async ({ where: { id } }: { where: { id: string } }) => {
    return referenceStore.get(id) ?? null;
  }),
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = referenceStore.get(id);
      if (!found) {
        throw new Error(`reference ${id} not found`);
      }
      return found;
    }
  ),
  findMany: mock(
    async ({
      where,
      take,
      skip,
    }: {
      where: { projectId?: string; date?: { gte: Date; lte: Date } };
      take?: number;
      skip?: number;
    }) => {
      let rows = [...referenceStore.values()];
      if (where.projectId) {
        rows = rows.filter((r) => r.projectId === where.projectId);
      }
      if (where.date) {
        rows = rows.filter(
          (r) => r.date >= where.date!.gte && r.date <= where.date!.lte
        );
      }
      if (skip) {
        rows = rows.slice(skip);
      }
      return take ? rows.slice(0, take) : rows;
    }
  ),
  create: mock(async ({ data }: { data: Omit<FakeReference, 'id'> }) => {
    const row = makeReference({ id: `ref_${referenceStore.size + 1}`, ...data });
    referenceStore.set(row.id, row);
    return row;
  }),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeReference>;
    }) => {
      const existing = referenceStore.get(id);
      if (!existing) {
        throw new Error(`reference ${id} not found`);
      }
      const next = { ...existing, ...data };
      referenceStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const existing = referenceStore.get(id);
    referenceStore.delete(id);
    return existing;
  }),
};

const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
  db: { reference },
}));

const getSettingsForProject = mock(async () => ({ timezone: 'UTC' }));
mock.module('@openpanel/db/src/services/organization.service', () => ({
  getSettingsForProject,
}));

const getChartStartEndDate = mock(() => ({
  startDate: '2026-08-25 00:00:00',
  endDate: '2026-09-01 23:59:59',
}));
mock.module('@openpanel/db/src/services/date.service', () => ({
  getChartStartEndDate,
}));

let subject: typeof import('./reference.service');
beforeAll(async () => {
  subject = await import('./reference.service');
});

beforeEach(() => {
  referenceStore.clear();
  getSettingsForProject.mockClear();
  getChartStartEndDate.mockClear();
});

test('getReferenceById returns null for a missing reference', async () => {
  expect(await subject.getReferenceById('missing')).toBeNull();
});

test('getReferenceByIdOrThrow throws for a missing reference', async () => {
  await expect(subject.getReferenceByIdOrThrow('missing')).rejects.toThrow();
});

test('listReferences paginates by cursor, 50 per page', async () => {
  const REFERENCE_COUNT = 55;
  for (const i of Array.from({ length: REFERENCE_COUNT }, (_, idx) => idx)) {
    referenceStore.set(`ref_${i}`, makeReference({ id: `ref_${i}` }));
  }
  const firstPage = await subject.listReferences({ projectId: 'proj_1' });
  expect(firstPage).toHaveLength(50);

  const secondPage = await subject.listReferences({
    projectId: 'proj_1',
    cursor: 1,
  });
  expect(secondPage).toHaveLength(5);
});

test('createReference stores the date as a Date, not a string', async () => {
  const result = await subject.createReference({
    title: 'Launch',
    description: 'v2 ships',
    projectId: 'proj_1',
    datetime: '2026-09-03T12:00:00.000Z',
  });
  expect(result.date).toBeInstanceOf(Date);
  expect(result.title).toBe('Launch');
});

test('updateReference normalizes a nullish description to null', async () => {
  referenceStore.set('ref_1', makeReference({ id: 'ref_1', description: 'old' }));
  const result = await subject.updateReference({
    id: 'ref_1',
    title: 'Renamed',
    description: undefined,
    datetime: '2026-09-03T00:00:00.000Z',
  });
  expect(result).toMatchObject({ title: 'Renamed', description: null });
});

test('deleteReference removes the row', async () => {
  referenceStore.set('ref_1', makeReference({ id: 'ref_1' }));
  await subject.deleteReference('ref_1');
  expect(referenceStore.has('ref_1')).toBe(false);
});

test('getChartReferences filters by the resolved date window', async () => {
  referenceStore.set(
    'ref_in_range',
    makeReference({
      id: 'ref_in_range',
      date: new Date('2026-08-28T00:00:00.000Z'),
    })
  );
  referenceStore.set(
    'ref_out_of_range',
    makeReference({
      id: 'ref_out_of_range',
      date: new Date('2026-01-01T00:00:00.000Z'),
    })
  );

  const result = await subject.getChartReferences({
    projectId: 'proj_1',
    range: 'last30Days' as never,
  });
  expect(result.map((r) => r.id)).toEqual(['ref_in_range']);
  expect(getSettingsForProject).toHaveBeenCalledWith('proj_1');
});
