// The events list's profile-filter join no longer reads `profiles FINAL`; it
// groups the raw rows by id and filters on the newest version. Runs against
// profiles with several unmerged versions (test/profile-versions).

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import { timeAgo } from '../../../../../../test/fixtures';
import {
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows, fetchRows } from '../../../../test/clickhouse-rows';
import { getEventFiltersWhereClause } from '../../chart/src/filter-where';
import type { IChartEventFilter } from '../../report/report.constants';
import { compiledFilterFragments } from './filter-clauses';
import { eventListQuery } from './sql';

const PROJECT_ID = 'event-profile-versions';
const COLUMNS = ['id', 'name', 'profile_id'] as const;

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let now: Date;

function listQuery(filters: IChartEventFilter[], profileColumns: string[]) {
  return eventListQuery({
    projectId: PROJECT_ID,
    columns: COLUMNS,
    take: 50,
    startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    endDate: now,
    filterClauses: getEventFiltersWhereClause(filters, PROJECT_ID, 'e'),
    joins: { profileColumns, groups: false },
  });
}

async function profileIds(
  filters: IChartEventFilter[],
  profileColumns: string[]
): Promise<string[]> {
  const rows = await fetchRows(ch, listQuery(filters, profileColumns));
  return [...new Set(rows.map((row) => JSON.parse(row).profile_id))].sort();
}

const planIs = (value: string): IChartEventFilter => ({
  id: 'f',
  name: 'profile.properties.plan',
  operator: 'is',
  value: [value],
});
const emailIs = (value: string): IChartEventFilter => ({
  id: 'f',
  name: 'profile.email',
  operator: 'is',
  value: [value],
});

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  now = await setupProfileVersions(PROJECT_ID);
}, 30_000);

afterAll(() => teardownProfileVersions(PROJECT_ID));

describe('eventListQuery with profile filters', () => {
  it('filters on the latest plan, not a stale version', async () => {
    expect(await profileIds([planIs('pro')], ['properties'])).toEqual([
      VERSIONED.single,
    ]);
    expect(await profileIds([planIs('team')], ['properties'])).toEqual([
      VERSIONED.multi,
    ]);
    expect(await profileIds([planIs('free')], ['properties'])).toEqual([
      VERSIONED.staleMatch,
    ]);
  });

  it('filters top-level columns on the latest version', async () => {
    expect(await profileIds([emailIs('mia@new.example')], ['email'])).toEqual([
      VERSIONED.multi,
    ]);
    expect(await profileIds([emailIs('mia@old.example')], ['email'])).toEqual(
      []
    );
  });

  it('matches the FINAL form it replaced, row for row', async () => {
    const filters = [planIs('team')];
    const clauses = getEventFiltersWhereClause(filters, PROJECT_ID, 'e');
    const window = sql`created_at >= toDateTime(${sql.string(timeAgo(now, 7))}) AND created_at <= toDateTime(${sql.string(timeAgo(now, 0))})`;
    const reference = sql`SELECT id, name, profile_id FROM events e LEFT ANY JOIN (SELECT id, properties FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)}) as profile on profile.id = profile_id WHERE project_id = ${sql.string(PROJECT_ID)} AND ${window} AND ${sql.join(compiledFilterFragments(clauses), ' AND ')}`;
    await expectSameRows(ch, reference, listQuery(filters, ['properties']), 4);
  });
});
