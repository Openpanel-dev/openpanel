// A `profile.*` filter on another table compiles to a semi-join that no
// longer reads `profiles FINAL`: it decides on the newest version of the
// column. Runs against profiles with several unmerged versions.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import {
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows } from '../../../../test/clickhouse-rows';
import type { IChartEventFilter } from '../../report/report.constants';
import { buildFilterWhere } from './table-filter-where';

const PROJECT_ID = 'semi-join-profile-versions';
const ON_EVENTS = {
  selfTable: 'events',
  profileIdExpr: 'profile_id',
  groupsExpr: 'groups',
} as const;

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  await setupProfileVersions(PROJECT_ID);
}, 30_000);

afterAll(() => teardownProfileVersions(PROJECT_ID));

function eventProfiles(clause: SqlFragment) {
  return sql`SELECT DISTINCT profile_id FROM events WHERE project_id = ${sql.string(PROJECT_ID)} AND ${clause}`;
}

/** The semi-join as it was: `profile_id IN (SELECT id FROM profiles FINAL WHERE ... AND <predicate>)`. */
function finalSemiJoin(predicate: SqlFragment) {
  return sql`profile_id IN (SELECT id FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND ${predicate})`;
}

const filter = (
  name: string,
  operator: IChartEventFilter['operator'],
  value: string
): IChartEventFilter => ({ id: 'f', name, operator, value: [value] });

describe('buildFilterWhere on events with a profile.* filter', () => {
  const cases: [string, IChartEventFilter, SqlFragment, string[]][] = [
    [
      'plan is pro: the stale pro version must not match',
      filter('profile.properties.plan', 'is', 'pro'),
      sql`properties['plan'] = 'pro'`,
      [VERSIONED.single],
    ],
    [
      'plan isNot pro: decided on the newest version',
      filter('profile.properties.plan', 'isNot', 'pro'),
      sql`properties['plan'] != 'pro'`,
      [VERSIONED.multi, VERSIONED.staleMatch],
    ],
    [
      'email is the old address: nothing matches',
      filter('profile.email', 'is', 'mia@old.example'),
      sql`email = 'mia@old.example'`,
      [],
    ],
    [
      'last_name contains the new value',
      filter('profile.last_name', 'contains', 'Lee'),
      sql`last_name LIKE '%Lee%'`,
      [VERSIONED.multi],
    ],
  ];

  it.each(cases)('%s', async (_label, profileFilter, predicate, expected) => {
    const [clause] = Object.values(
      buildFilterWhere([profileFilter], PROJECT_ID, ON_EVENTS)
    );
    expect(clause).toBeDefined();
    expect(clause?.toStatement().query).not.toContain('FINAL');
    const rows = await expectSameRows(
      ch,
      eventProfiles(finalSemiJoin(predicate)),
      eventProfiles(clause as SqlFragment),
      expected.length
    );
    expect(rows.map((row) => JSON.parse(row).profile_id).sort()).toEqual(
      [...expected].sort()
    );
  });
});
