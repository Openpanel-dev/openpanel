// The cohort member page no longer reads `profiles FINAL`: search and
// filters decide on the newest version. Runs against profiles with several
// unmerged versions (test/profile-versions) enrolled in one cohort.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import {
  otherProjectId,
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../test/profile-versions';
import { fetchRows } from '../../../test/clickhouse-rows';
import type { IChartEventFilter } from '../report/report.constants';

const PROJECT_ID = 'cohort-profile-versions';
const COHORT_ID = 'dddddddd-0000-4000-8000-00000000pv01';

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let deps: import('../../services').ServiceDeps;
let listCohortMemberProfiles: typeof import('./cohort.service').listCohortMemberProfiles;

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { testServiceDeps } = await import('../../../test/service-deps');
  deps = await testServiceDeps();
  ({ listCohortMemberProfiles } = await import('./cohort.service'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  await setupProfileVersions(PROJECT_ID);
  await ch.insert({
    table: 'cohort_members',
    values: [VERSIONED.multi, VERSIONED.staleMatch, VERSIONED.single].map(
      (profileId) => ({
        project_id: PROJECT_ID,
        cohort_id: COHORT_ID,
        profile_id: profileId,
        matching_properties: {},
        version: 1,
      })
    ),
    format: 'JSONEachRow',
  });
  await ch.insert({
    table: 'cohort_members',
    values: [
      {
        project_id: otherProjectId(PROJECT_ID),
        cohort_id: COHORT_ID,
        profile_id: VERSIONED.multi,
        matching_properties: {},
        version: 1,
      },
    ],
    format: 'JSONEachRow',
  });
}, 30_000);

afterAll(async () => {
  await ch.command({
    query: `DELETE FROM cohort_members WHERE cohort_id = '${COHORT_ID}'`,
  });
  await teardownProfileVersions(PROJECT_ID);
});

const planIs = (value: string): IChartEventFilter => ({
  id: 'f',
  name: 'profile.properties.plan',
  operator: 'is',
  value: [value],
});

async function page(
  options: { search?: string; filters?: IChartEventFilter[] } = {}
) {
  const { data, count } = await listCohortMemberProfiles(deps, {
    projectId: PROJECT_ID,
    cohortId: COHORT_ID,
    take: 10,
    ...options,
  });
  return { ids: data.map((profile) => profile.id), count };
}

describe('listCohortMemberProfiles', () => {
  it('pages the members newest first with the total, like FINAL did', async () => {
    const reference = await fetchRows(
      ch,
      sql`SELECT id FROM profiles FINAL WHERE project_id = ${sql.string(PROJECT_ID)} AND id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = ${sql.string(COHORT_ID)} AND project_id = ${sql.string(PROJECT_ID)}) ORDER BY created_at DESC LIMIT 10`
    );
    const { ids, count } = await page();
    expect(ids).toEqual([
      VERSIONED.single,
      VERSIONED.staleMatch,
      VERSIONED.multi,
    ]);
    expect([...ids].sort()).toEqual(
      reference.map((row) => JSON.parse(row).id).sort()
    );
    expect(count).toBe(3);
  });

  it('search and filters decide on the newest version', async () => {
    expect(await page({ filters: [planIs('pro')] })).toEqual({
      ids: [VERSIONED.single],
      count: 1,
    });
    expect(await page({ search: 'mia' })).toEqual({
      ids: [VERSIONED.multi],
      count: 1,
    });
    expect(await page({ search: 'Old' })).toEqual({ ids: [], count: 0 });
  });
});
