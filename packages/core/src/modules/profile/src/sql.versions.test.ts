// The profile lookups no longer read `profiles FINAL`. Each test runs the
// statement that was replaced (kept verbatim here) and the one the module
// builds now against profiles with several unmerged versions, and the rows
// must match.

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import {
  otherProjectId,
  setupProfileVersions,
  teardownProfileVersions,
  VERSIONED,
} from '../../../../../../test/profile-versions';
import { expectSameRows, fetchRows } from '../../../../test/clickhouse-rows';
import {
  PROFILE_COLUMNS,
  profileByIdQuery,
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

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  await setupProfileVersions(PROJECT_ID);
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
