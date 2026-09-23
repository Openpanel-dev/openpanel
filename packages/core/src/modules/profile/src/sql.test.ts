// Shape tests for the profile module's fragments: every user value binds as a
// `{pN:Type}` parameter (nothing is interpolated), the optional clauses toggle
// exactly on V1's conditions, and `sql.id` refuses anything off the column
// whitelist. Result-set equivalence against V1 was proven per query on the
// local prod-copy (M7-002 report), not here — these run offline.

import { describe, expect, test } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import {
  findProfilesQuery,
  PROFILE_COLUMNS,
  powerUsersQuery,
  profileActivityQuery,
  profileByIdQuery,
  profileListCountQuery,
  profileListQuery,
  profileMostEventsQuery,
  profilePopularRoutesQuery,
  profilePropertyKeysQuery,
  profilePropertyNamesQuery,
  profileRecentEventsQuery,
  profileRowQuery,
  profileSearchCondition,
  profileSessionsQuery,
  profilesByIdsQuery,
  profileValuesQuery,
} from './sql';

const PROJECT_ID = 'proj-1';
const PROFILE_ID = 'prof-1';
const HOSTILE = "x' OR 1=1 --";
const NO_FILTERS = {};
const WINDOW = {
  startDate: '2026-06-16 00:00:00',
  endDate: '2026-09-16 23:59:59',
};
const COLUMN_LIST = PROFILE_COLUMNS.join(', ');
const PLAIN_WHERE = /\sWHERE\s/;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('profileSearchCondition', () => {
  test('blank search is null', () => {
    expect(profileSearchCondition(undefined)).toBeNull();
    expect(profileSearchCondition(null)).toBeNull();
    expect(profileSearchCondition('   ')).toBeNull();
  });

  test('one token binds the same %..% pattern to all five columns', () => {
    const token = "x'OR(1=1)--";
    const { query, query_params } = (
      profileSearchCondition(token) as NonNullable<
        ReturnType<typeof profileSearchCondition>
      >
    ).toStatement();

    expect(collapse(query)).toBe(
      "((id ILIKE {p1:String} OR email ILIKE {p2:String} OR first_name ILIKE {p3:String} OR last_name ILIKE {p4:String} OR concat(first_name, ' ', last_name) ILIKE {p5:String}))"
    );
    expect(query).not.toContain(token);
    expect(Object.values(query_params)).toEqual(
      new Array(5).fill(`%${token}%`)
    );
  });

  test('tokens AND together and cap at five', () => {
    const { query, query_params } = (
      profileSearchCondition('a b  c d e f g') as NonNullable<
        ReturnType<typeof profileSearchCondition>
      >
    ).toStatement();

    expect(collapse(query).split(') AND (')).toHaveLength(5);
    expect(Object.keys(query_params)).toHaveLength(25);
    expect(query_params.p1).toBe('%a%');
    expect(query_params.p25).toBe('%e%');
  });
});

describe('single-profile lookups', () => {
  test('profileByIdQuery / profileRowQuery select the whitelisted columns', () => {
    const byId = profileByIdQuery({
      id: HOSTILE,
      projectId: PROJECT_ID,
    }).toStatement();
    const row = profileRowQuery({
      projectId: PROJECT_ID,
      profileId: HOSTILE,
    }).toStatement();

    expect(collapse(byId.query)).toBe(
      `SELECT ${COLUMN_LIST} FROM profiles FINAL WHERE id = {p1:String} AND project_id = {p2:String} LIMIT 1`
    );
    expect(byId.query_params).toEqual({ p1: HOSTILE, p2: PROJECT_ID });
    expect(collapse(row.query)).toBe(
      `SELECT ${COLUMN_LIST} FROM profiles FINAL WHERE project_id = {p1:String} AND id = {p2:String} LIMIT 1`
    );
    expect(row.query_params).toEqual({ p1: PROJECT_ID, p2: HOSTILE });
  });

  test('profilesByIdsQuery filters by sort key in PREWHERE, binding ids as one Array(String)', () => {
    const { query, query_params } = profilesByIdsQuery({
      projectId: PROJECT_ID,
      ids: ['a', HOSTILE],
    }).toStatement();

    expect(collapse(query)).toContain(
      'FROM profiles FINAL PREWHERE project_id = {p1:String} AND id IN {p2:Array(String)}'
    );
    expect(query).not.toMatch(PLAIN_WHERE);
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: ['a', HOSTILE] });
  });

  test('recent events / sessions bind project, profile, limit', () => {
    const events = profileRecentEventsQuery({
      projectId: PROJECT_ID,
      profileId: PROFILE_ID,
      limit: 10,
    }).toStatement();
    const sessions = profileSessionsQuery({
      projectId: PROJECT_ID,
      profileId: PROFILE_ID,
      limit: 10,
    }).toStatement();

    expect(events.query).toBe(
      'SELECT * FROM events WHERE project_id = {p1:String} AND profile_id = {p2:String} ORDER BY toDate(created_at) DESC, created_at DESC LIMIT {p3:UInt64}'
    );
    expect(sessions.query).toBe(
      'SELECT * FROM sessions WHERE project_id = {p1:String} AND profile_id = {p2:String} AND sign = 1 ORDER BY created_at DESC LIMIT {p3:UInt64}'
    );
    expect(events.query_params).toEqual({
      p1: PROJECT_ID,
      p2: PROFILE_ID,
      p3: 10,
    });
    expect(sessions.query_params).toEqual(events.query_params);
  });
});

describe('profileListQuery', () => {
  test('plain page: project + window, no OFFSET at offset 0', () => {
    const { query, query_params } = profileListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
      filterClauses: NO_FILTERS,
      ...WINDOW,
    }).toStatement();
    const text = collapse(query);

    expect(text).toBe(
      'SELECT * FROM profiles FINAL WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) ORDER BY created_at DESC LIMIT {p4:UInt64}'
    );
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: '2026-06-16 00:00:00',
      p3: '2026-09-16 23:59:59',
      p4: 50,
    });
  });

  test('search + isExternal + filters + offset all splice in V1 order', () => {
    const { query, query_params } = profileListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 100,
      search: 'ann',
      isExternal: true,
      filterClauses: { f0: sql`(properties['plan'] = 'pro')` },
      ...WINDOW,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      "WHERE project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) AND ((id ILIKE {p4:String} OR email ILIKE {p5:String} OR first_name ILIKE {p6:String} OR last_name ILIKE {p7:String} OR concat(first_name, ' ', last_name) ILIKE {p8:String})) AND is_external = {p9:Bool} AND (properties['plan'] = 'pro') ORDER BY created_at DESC LIMIT {p10:UInt64} OFFSET {p11:UInt64}"
    );
    expect(query_params).toMatchObject({
      p1: PROJECT_ID,
      p4: '%ann%',
      p9: true,
      p10: 50,
      p11: 100,
    });
  });

  test('count shares the exact WHERE of the page (minus FINAL)', () => {
    const list = {
      projectId: PROJECT_ID,
      search: 'ann',
      isExternal: false,
      filterClauses: { f0: sql`(email != '')` },
      ...WINDOW,
    };
    const page = collapse(
      profileListQuery({ ...list, take: 1, offset: 0 }).toStatement().query
    );
    const count = collapse(profileListCountQuery(list).toStatement().query);
    const whereOf = (text: string) =>
      text
        .slice(text.indexOf('WHERE'))
        .replace(/ ORDER BY.*$/, '')
        .replace(/ GROUP BY.*$/, '');

    expect(count).toStartWith(
      'SELECT uniqExact(id) as count FROM profiles WHERE'
    );
    expect(count).toEndWith('GROUP BY project_id');
    expect(whereOf(count)).toBe(whereOf(page));
  });
});

describe('findProfilesQuery', () => {
  const base = {
    projectId: PROJECT_ID,
    filterClauses: NO_FILTERS,
    sortOrder: 'desc' as const,
    limit: 25,
  };

  test('minimal: project guard, DESC, bound limit', () => {
    const { query, query_params } = findProfilesQuery(base).toStatement();

    expect(collapse(query)).toBe(
      `SELECT ${COLUMN_LIST} FROM profiles FINAL WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64}`
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 25 });
  });

  test('every optional condition binds and none interpolates', () => {
    const { query, query_params } = findProfilesQuery({
      ...base,
      sortOrder: 'asc',
      email: HOSTILE,
      name: 'ann',
      country: 'SE',
      city: HOSTILE,
      device: 'mobile',
      browser: 'Firefox',
      inactiveDays: 7,
      minSessions: 3,
      performedEvent: HOSTILE,
      filterClauses: { f0: sql`(1 = 1)` },
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain('AND email ILIKE {p2:String}');
    expect(text).toContain(
      'AND properties[{p8:String}] = {p9:String} AND properties[{p10:String}] = {p11:String} AND properties[{p12:String}] = {p13:String} AND properties[{p14:String}] = {p15:String}'
    );
    expect(text).toContain(
      "AND id NOT IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p16:String} AND profile_id != '' AND created_at >= now() - INTERVAL {p17:UInt64} DAY )"
    );
    expect(text).toContain(
      "AND id IN ( SELECT profile_id FROM sessions WHERE project_id = {p18:String} AND sign = 1 AND profile_id != '' GROUP BY profile_id HAVING count() >= {p19:UInt64} )"
    );
    expect(text).toContain(
      'AND id IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p20:String} AND name = {p21:String} )'
    );
    expect(text).toEndWith(
      'AND (1 = 1) ORDER BY created_at ASC LIMIT {p22:UInt64}'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toMatchObject({
      p2: `%${HOSTILE}%`,
      p8: 'country',
      p9: 'SE',
      p10: 'city',
      p11: HOSTILE,
      p17: 7,
      p19: 3,
      p21: HOSTILE,
      p22: 25,
    });
  });

  test('inactiveDays / minSessions toggle on undefined, not on 0', () => {
    const zero = collapse(
      findProfilesQuery({
        ...base,
        inactiveDays: 0,
        minSessions: 0,
      }).toStatement().query
    );
    expect(zero).toContain('NOT IN');
    expect(zero).toContain('INTERVAL {p3:UInt64} DAY');
    expect(zero).toContain('HAVING count() >= {p5:UInt64}');
  });
});

describe('project-wide vocab', () => {
  test("property keys keeps V1's is_external guard and no FINAL", () => {
    const { query, query_params } =
      profilePropertyKeysQuery(PROJECT_ID).toStatement();

    expect(query).toBe(
      'SELECT DISTINCT arrayJoin(mapKeys(properties)) as key FROM profiles WHERE project_id = {p1:String} AND is_external = {p2:Bool}'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: true });
  });

  test('property names binds only the project', () => {
    const { query, query_params } =
      profilePropertyNamesQuery(PROJECT_ID).toStatement();

    expect(query).toContain(
      'SELECT distinct mapKeys(properties) as keys from profiles where project_id = {p1:String}'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID });
  });
});

describe('the trpc router queries', () => {
  const ref = { projectId: PROJECT_ID, profileId: HOSTILE };

  test('activity / mostEvents / popularRoutes bind project then profile', () => {
    const activity = profileActivityQuery(ref).toStatement();
    const most = profileMostEventsQuery(ref).toStatement();
    const routes = profilePopularRoutesQuery(ref).toStatement();

    for (const { query, query_params } of [activity, most, routes]) {
      expect(query).toContain(
        'project_id = {p1:String} and profile_id = {p2:String}'
      );
      expect(query).not.toContain(HOSTILE);
      expect(query_params).toMatchObject({ p1: PROJECT_ID, p2: HOSTILE });
    }
    expect(most.query).toContain(
      "WHERE name NOT IN ('screen_view', 'session_start', 'session_end')"
    );
    expect(routes.query).toEndWith(
      'GROUP BY path ORDER BY count DESC LIMIT {p3:UInt64}'
    );
    expect(routes.query_params.p3).toBe(10);
  });

  test('powerUsers: OFFSET only when offset > 0', () => {
    const first = powerUsersQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
      ...WINDOW,
    }).toStatement();
    const later = powerUsersQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 50,
      ...WINDOW,
    }).toStatement();

    expect(collapse(first.query)).toEndWith(
      'GROUP BY profile_id ORDER BY count() DESC LIMIT {p4:UInt64}'
    );
    expect(first.query_params).toEqual({
      p1: PROJECT_ID,
      p2: '2026-06-16 00:00:00',
      p3: '2026-09-16 23:59:59',
      p4: 50,
    });
    expect(collapse(later.query)).toEndWith(
      'LIMIT {p4:UInt64} OFFSET {p5:UInt64}'
    );
    expect(later.query_params).toEqual({
      p1: PROJECT_ID,
      p2: '2026-06-16 00:00:00',
      p3: '2026-09-16 23:59:59',
      p4: 50,
      p5: 50,
    });
  });

  test('powerUsers is bounded to the window it was given', () => {
    const { query } = powerUsersQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
      ...WINDOW,
    }).toStatement();

    expect(collapse(query)).toContain(
      'project_id = {p1:String} AND created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String}) GROUP BY profile_id'
    );
  });
});

describe('profileValuesQuery', () => {
  test('properties.* path binds the key with .*. rewritten to .%.', () => {
    const { query, query_params } = profileValuesQuery({
      projectId: PROJECT_ID,
      property: 'properties.plan.*.tier',
    }).toStatement();

    expect(query).toBe(
      'SELECT distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, {p1:String}))) as values FROM profiles WHERE project_id = {p2:String}'
    );
    expect(query_params).toEqual({ p1: 'plan.%.tier', p2: PROJECT_ID });
  });

  test('bare column must be one of the picker columns', () => {
    const { query } = profileValuesQuery({
      projectId: PROJECT_ID,
      property: 'email',
    }).toStatement();
    expect(query).toBe(
      'SELECT email as values FROM profiles WHERE project_id = {p1:String}'
    );

    expect(() =>
      profileValuesQuery({ projectId: PROJECT_ID, property: HOSTILE })
    ).toThrow();
    expect(() =>
      profileValuesQuery({ projectId: PROJECT_ID, property: 'project_id' })
    ).toThrow();
  });
});
