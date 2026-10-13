// The profile lookups no longer read `profiles FINAL`. Each test runs the
// statement that was replaced (kept verbatim here) and the one the module
// builds now against profiles with several unmerged versions, and the rows
// must match.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import { timeAgo } from '../../../../../../test/fixtures';
import {
  otherProjectId,
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows, fetchRows } from '../../../../test/clickhouse-rows';
import { buildFilterWhere } from '../../chart/src/table-filter-where';
import type { IChartEventFilter } from '../../report/report.constants';
import {
  findProfilesQuery,
  PROFILE_COLUMNS,
  profileByIdQuery,
  profileListCountQuery,
  profileListQuery,
  profileMetricsQuery,
  profileRowQuery,
  profilesByIdsQuery,
} from './sql';

const PROJECT_ID = 'profile-versions-lookups';
const columns = sql.join(
  PROFILE_COLUMNS.map((column) => sql.id(column, PROFILE_COLUMNS)),
  ', '
);

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let now: Date;

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  now = await setupProfileVersions(PROJECT_ID);
}, 30_000);

afterAll(() => teardownProfileVersions(PROJECT_ID));

it('the fixture holds every version unmerged', async () => {
  const [row] = await fetchRows(
    ch,
    sql`SELECT count() AS rows, uniqExact(id) AS ids FROM profiles WHERE project_id = ${sql.string(PROJECT_ID)}`
  );
  const counts = JSON.parse(row as string);
  expect([Number(counts.rows), Number(counts.ids)]).toEqual([6, 3]);
});

function finalById(id: string, projectId = PROJECT_ID) {
  return sql`SELECT ${columns} FROM profiles FINAL WHERE id = ${sql.string(id)} AND project_id = ${sql.string(projectId)} LIMIT 1`;
}

describe('profileByIdQuery / profileRowQuery', () => {
  it.each([
    ['multi-version', VERSIONED.multi, 'mia@new.example', 'team'],
    ['stale old version', VERSIONED.staleMatch, 'sam@example.com', 'free'],
    ['single version', VERSIONED.single, 'uno@example.com', 'pro'],
  ])('%s: returns the latest version', async (_label, id, email, plan) => {
    const [row] = await expectSameRows(
      ch,
      finalById(id),
      profileByIdQuery({ id, projectId: PROJECT_ID }),
      1
    );
    const parsed = JSON.parse(row as string);
    expect(parsed.email).toBe(email);
    expect(parsed.properties.plan).toBe(plan);

    await expectSameRows(
      ch,
      finalById(id),
      profileRowQuery({ profileId: id, projectId: PROJECT_ID }),
      1
    );
  });

  it('carries every changed column of the latest version', async () => {
    const [row] = await fetchRows(
      ch,
      profileByIdQuery({ id: VERSIONED.multi, projectId: PROJECT_ID })
    );
    expect(JSON.parse(row as string)).toMatchObject({
      last_name: 'Kim-Lee',
      is_external: true,
      properties: { plan: 'team', country: 'SE', tier: 'gold' },
      groups: [VERSIONED.groups.g1, VERSIONED.groups.g2],
    });
  });

  it('keeps projects apart and misses cleanly', async () => {
    const other = otherProjectId(PROJECT_ID);
    const [row] = await expectSameRows(
      ch,
      finalById(VERSIONED.multi, other),
      profileByIdQuery({ id: VERSIONED.multi, projectId: other }),
      1
    );
    expect(JSON.parse(row as string).properties.plan).toBe('enterprise');

    await expectSameRows(
      ch,
      finalById('pv-missing'),
      profileByIdQuery({ id: 'pv-missing', projectId: PROJECT_ID }),
      0
    );
  });
});

describe('profilesByIdsQuery', () => {
  it('returns one latest row per id, only from this project', async () => {
    const ids = [
      VERSIONED.multi,
      VERSIONED.staleMatch,
      VERSIONED.single,
      'pv-missing',
    ];
    const rows = await expectSameRows(
      ch,
      sql`SELECT ${columns} FROM profiles FINAL PREWHERE project_id = ${sql.string(PROJECT_ID)} AND id IN ${sql.array('String', ids)}`,
      profilesByIdsQuery({ projectId: PROJECT_ID, ids }),
      3
    );
    const plans = rows.map((row) => JSON.parse(row).properties.plan).sort();
    expect(plans).toEqual(['free', 'pro', 'team']);
  });
});

describe('profileMetricsQuery', () => {
  it('reads first/last seen from the latest version', async () => {
    const [metrics] = await fetchRows(
      ch,
      profileMetricsQuery({ profileId: VERSIONED.multi, projectId: PROJECT_ID })
    );
    const [seen] = await fetchRows(
      ch,
      sql`SELECT created_at as firstSeen, last_seen_at as lastSeen FROM profiles FINAL WHERE id = ${sql.string(VERSIONED.multi)} AND project_id = ${sql.string(PROJECT_ID)} LIMIT 1`
    );
    const expected = JSON.parse(seen as string);
    expect(JSON.parse(metrics as string)).toMatchObject(expected);
  });
});

const PROFILE_TARGET = {
  selfTable: 'profiles',
  profileIdExpr: 'id',
  groupsExpr: 'groups',
} as const;
const planIs = (value: string): IChartEventFilter => ({
  id: 'f',
  name: 'profile.properties.plan',
  operator: 'is',
  value: [value],
});
function compiled(filters: IChartEventFilter[]) {
  return {
    filterClauses: buildFilterWhere(filters, PROJECT_ID, PROFILE_TARGET),
    latestFilterClauses: buildFilterWhere(filters, PROJECT_ID, {
      ...PROFILE_TARGET,
      latestVersion: true,
    }),
  };
}
const ids = (rows: string[]) => rows.map((row) => JSON.parse(row).id);

describe('profileListQuery / profileListCountQuery', () => {
  const window = () => ({
    startDate: timeAgo(now, 60),
    endDate: timeAgo(now, 0),
  });
  const list = (
    overrides: Partial<Parameters<typeof profileListQuery>[0]> = {},
    filters: IChartEventFilter[] = []
  ) =>
    profileListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
      ...window(),
      ...compiled(filters),
      ...overrides,
    });
  const count = (
    overrides: Partial<Parameters<typeof profileListCountQuery>[0]> = {},
    filters: IChartEventFilter[] = []
  ) =>
    profileListCountQuery({
      projectId: PROJECT_ID,
      ...window(),
      ...compiled(filters),
      ...overrides,
    });
  const countOf = async (fragment: ReturnType<typeof count>) =>
    Number(JSON.parse((await fetchRows(ch, fragment))[0] as string).count);

  it('pages the newest version of every profile in the window, like FINAL did', async () => {
    const reference = sql`SELECT * FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND created_at BETWEEN toDateTime(${sql.string(timeAgo(now, 60))}) AND toDateTime(${sql.string(timeAgo(now, 0))}) ORDER BY created_at DESC LIMIT 50`;
    const rows = await expectSameRows(ch, reference, list(), 3);
    expect(ids(rows).sort()).toEqual(
      [VERSIONED.multi, VERSIONED.staleMatch, VERSIONED.single].sort()
    );
    expect(await countOf(count())).toBe(3);
  });

  it('keeps the newest-first order and the offset', async () => {
    const page = (await fetchRows(ch, list({ take: 2, offset: 1 }))).map(
      (row) => JSON.parse(row)
    );
    const ordered = page.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    expect(ordered.map((row) => row.id)).toEqual([
      VERSIONED.staleMatch,
      VERSIONED.multi,
    ]);
  });

  it('filters, searches and is_external read the newest version', async () => {
    expect(ids(await fetchRows(ch, list({}, [planIs('pro')])))).toEqual([
      VERSIONED.single,
    ]);
    expect(await countOf(count({}, [planIs('pro')]))).toBe(1);
    expect(ids(await fetchRows(ch, list({ search: 'mia' })))).toEqual([
      VERSIONED.multi,
    ]);
    expect(ids(await fetchRows(ch, list({ search: 'Old' })))).toEqual([]);
    expect(await countOf(count({ isExternal: true }))).toBe(3);
    expect(await countOf(count({ isExternal: false }))).toBe(0);
  });

  it('a search finds a profile created before the window, by its newest version', async () => {
    const recentWindow = {
      startDate: timeAgo(now, 15),
      endDate: timeAgo(now, 0),
    };
    expect(ids(await fetchRows(ch, list(recentWindow)))).toEqual([
      VERSIONED.single,
    ]);
    expect(
      ids(await fetchRows(ch, list({ ...recentWindow, search: 'Kim-Lee' })))
    ).toEqual([VERSIONED.multi]);
    expect(await countOf(count({ ...recentWindow, search: 'Kim-Lee' }))).toBe(
      1
    );
    expect(
      ids(await fetchRows(ch, list({ ...recentWindow, search: 'mia@old' })))
    ).toEqual([]);
  });
});

describe('findProfilesQuery', () => {
  const find = (
    overrides: Partial<Parameters<typeof findProfilesQuery>[0]> = {},
    filters: IChartEventFilter[] = []
  ) =>
    findProfilesQuery({
      projectId: PROJECT_ID,
      sortOrder: 'desc',
      limit: 20,
      ...compiled(filters),
      ...overrides,
    });

  it('matches the FINAL form it replaced, row for row', async () => {
    const reference = sql`SELECT ${columns} FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} ORDER BY created_at DESC LIMIT 20`;
    await expectSameRows(ch, reference, find(), 3);
  });

  it('every column condition reads the newest version', async () => {
    expect(ids(await fetchRows(ch, find({ email: 'mia' })))).toEqual([
      VERSIONED.multi,
    ]);
    expect(ids(await fetchRows(ch, find({ email: 'old.example' })))).toEqual(
      []
    );
    expect(ids(await fetchRows(ch, find({ country: 'US' })))).toEqual([
      VERSIONED.staleMatch,
    ]);
    expect(ids(await fetchRows(ch, find({ name: 'Kim-Lee' })))).toEqual([
      VERSIONED.multi,
    ]);
    expect(
      ids(
        await fetchRows(ch, find({ performedEvent: 'signup' }, [planIs('pro')]))
      )
    ).toEqual([VERSIONED.single]);
  });
});
