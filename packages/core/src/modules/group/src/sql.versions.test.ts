// The group member queries no longer read `profiles FINAL`: membership is
// decided on the newest version of `groups`. Runs against profiles with
// several unmerged versions (test/profile-versions).

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import {
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows, fetchRows } from '../../../../test/clickhouse-rows';
import {
  groupMemberGrowthQuery,
  groupMemberProfilesQuery,
  groupUniqueProfilesQuery,
} from './sql';

const PROJECT_ID = 'group-profile-versions';
const { g1, g2 } = VERSIONED.groups;

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

const parsed = async (fragment: Parameters<typeof fetchRows>[1]) =>
  (await fetchRows(ch, fragment)).map((row) => JSON.parse(row));

describe('group members', () => {
  it('counts profiles whose newest version is in the group, like FINAL did', async () => {
    for (const [groupId, expected] of [
      [g1, 2],
      [g2, 2],
      ['pv-no-such-group', 0],
    ] as const) {
      const reference = sql`SELECT count() AS uniqueProfiles FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND has(groups, ${sql.string(groupId)})`;
      const [row] = await expectSameRows(
        ch,
        reference,
        groupUniqueProfilesQuery({ projectId: PROJECT_ID, groupId }),
        1
      );
      expect(Number(JSON.parse(row as string).uniqueProfiles)).toBe(expected);
    }
  });

  it('pages the member ids with the total, and searches the newest version', async () => {
    const page = (search?: string) =>
      groupMemberProfilesQuery({
        projectId: PROJECT_ID,
        groupId: g1,
        take: 10,
        offset: 0,
        search,
      });
    const reference = sql`SELECT id, count() OVER () AS total_count FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND has(groups, ${sql.string(g1)}) ORDER BY created_at DESC LIMIT 10 OFFSET 0`;
    const members = await expectSameRows(ch, reference, page(), 2);
    expect(members.map((row) => JSON.parse(row).id).sort()).toEqual(
      [VERSIONED.multi, VERSIONED.staleMatch].sort()
    );
    expect(Number(JSON.parse(members[0] as string).total_count)).toBe(2);
    expect((await parsed(page('sam'))).map((row) => row.id)).toEqual([
      VERSIONED.staleMatch,
    ]);
    expect((await parsed(page('Old'))).map((row) => row.id)).toEqual([]);
  });

  it('member growth counts first-seen days of the newest version, like FINAL did', async () => {
    const reference = sql`SELECT toDate(toStartOfDay(created_at)) AS date, count() AS count FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND has(groups, ${sql.string(g2)}) AND created_at >= now() - INTERVAL 30 DAY GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL 29 DAY) TO toDate(now() + INTERVAL 1 DAY) STEP 1`;
    const rows = await expectSameRows(
      ch,
      reference,
      groupMemberGrowthQuery({ projectId: PROJECT_ID, groupId: g2 }),
      30
    );
    const counted = rows
      .map((row) => JSON.parse(row))
      .filter((row) => Number(row.count) > 0);
    expect(counted).toHaveLength(1);
    expect(Number(counted[0].count)).toBe(1);
  });
});
