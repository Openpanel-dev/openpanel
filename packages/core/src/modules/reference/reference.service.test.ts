// The subject is built by its factory over a fake `ServiceDeps`, so Postgres
// needs no module mock at all — `deps.db` IS the fake below. Only the two
// sibling modules the service still calls as plain functions are mocked, at the
// specifier the source resolves through.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';

interface FakeReference {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  date: Date;
}

const referenceStore = new Map<string, FakeReference>();
const projectOrganizations = new Map([
  ['proj_1', 'org_1'],
  ['proj_other', 'org_2'],
]);

interface FakeReferenceWhere {
  id?: string;
  projectId?: string;
  date?: { gte: Date; lte: Date };
  project?: { organizationId: string };
}

function matchesReference(row: FakeReference, where: FakeReferenceWhere) {
  const organizationId = projectOrganizations.get(row.projectId);
  return (
    (where.id === undefined || row.id === where.id) &&
    (where.projectId === undefined || row.projectId === where.projectId) &&
    (where.date === undefined ||
      (row.date >= where.date.gte && row.date <= where.date.lte)) &&
    (where.project === undefined ||
      organizationId === where.project.organizationId)
  );
}

const project = {
  findFirst: mock(
    async ({
      where: { id, organizationId },
    }: {
      where: { id: string; organizationId: string };
    }) => (projectOrganizations.get(id) === organizationId ? { id } : null)
  ),
};

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
  findFirst: mock(
    async ({ where }: { where: FakeReferenceWhere }) =>
      [...referenceStore.values()].find((r) => matchesReference(r, where)) ??
      null
  ),
  findMany: mock(
    async ({
      where,
      take,
      skip,
    }: {
      where: FakeReferenceWhere;
      take?: number;
      skip?: number;
    }) => {
      let rows = [...referenceStore.values()].filter((r) =>
        matchesReference(r, where)
      );
      if (skip) {
        rows = rows.slice(skip);
      }
      return take ? rows.slice(0, take) : rows;
    }
  ),
  create: mock(async ({ data }: { data: Omit<FakeReference, 'id'> }) => {
    const row = makeReference({
      id: `ref_${referenceStore.size + 1}`,
      ...data,
    });
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
      // Prisma skips `undefined` fields rather than writing them.
      const defined = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
      );
      const next = { ...existing, ...defined };
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

const getSettingsForProject = mock(
  async (_deps: unknown, _projectId: string) => ({ timezone: 'UTC' })
);
const getChartStartEndDate = mock(() => ({
  startDate: '2026-08-25 00:00:00',
  endDate: '2026-09-01 23:59:59',
}));
// Each is mocked at the specifier the source resolves through, snapshot-before-mock so
// `afterAll` restores the real module rather than re-applying the mock.
const actualOrganization = await import('../organization/organization.service');
const realOrganization = { ...actualOrganization };
mock.module('../organization/organization.service', () => ({
  ...realOrganization,
  getSettingsForProject,
}));
const actualDate = await import('../report/src/chart-dates');
const realDate = { ...actualDate };
mock.module('../report/src/chart-dates', () => ({
  ...realDate,
  getChartStartEndDate,
}));

afterAll(() => {
  mock.module('../organization/organization.service', () => realOrganization);
  mock.module('../report/src/chart-dates', () => realDate);
});

let subject: ReturnType<
  typeof import('./reference.service').createReferenceService
>;
beforeAll(async () => {
  const { createReferenceService } = await import('./reference.service');
  subject = createReferenceService(
    {
      db: { reference, project },
    } as unknown as import('../../services').ServiceDeps,
    testServices()
  );
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
  referenceStore.set(
    'ref_1',
    makeReference({ id: 'ref_1', description: 'old' })
  );
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
  expect(getSettingsForProject).toHaveBeenCalledWith(
    expect.anything(),
    'proj_1'
  );
});

test('listReferencesForOrganization without a project spans only that organization', async () => {
  referenceStore.set('ref_1', makeReference({ id: 'ref_1' }));
  referenceStore.set(
    'ref_2',
    makeReference({ id: 'ref_2', projectId: 'proj_other' })
  );
  const result = await subject.listReferencesForOrganization('org_1');
  expect(result?.map((r) => r.id)).toEqual(['ref_1']);
});

test('listReferencesForOrganization returns null for another organization’s project', async () => {
  expect(
    await subject.listReferencesForOrganization('org_1', 'proj_other')
  ).toBeNull();
});

test('createReferenceForOrganization refuses another organization’s project', async () => {
  const result = await subject.createReferenceForOrganization('org_1', {
    projectId: 'proj_other',
    title: 'Launch',
    datetime: '2026-09-03T00:00:00.000Z',
  });
  expect(result).toBeNull();
  expect(referenceStore.size).toBe(0);
});

test('another organization’s reference cannot be read, updated or deleted', async () => {
  referenceStore.set(
    'ref_1',
    makeReference({ id: 'ref_1', projectId: 'proj_other' })
  );
  expect(
    await subject.getReferenceForOrganization('ref_1', 'org_1')
  ).toBeNull();
  expect(
    await subject.updateReferenceForOrganization('ref_1', 'org_1', {
      title: 'Renamed',
    })
  ).toBeNull();
  expect(await subject.deleteReferenceForOrganization('ref_1', 'org_1')).toBe(
    false
  );
  expect(referenceStore.get('ref_1')?.title).toBe('Launch');
});

test('updateReferenceForOrganization changes only the fields sent', async () => {
  referenceStore.set(
    'ref_1',
    makeReference({ id: 'ref_1', description: 'kept' })
  );
  const result = await subject.updateReferenceForOrganization(
    'ref_1',
    'org_1',
    { title: 'Renamed' }
  );
  expect(result).toMatchObject({
    title: 'Renamed',
    description: 'kept',
    date: new Date('2026-09-01T00:00:00.000Z'),
  });
});
