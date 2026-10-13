// Shape tests for the profile module's fragments: every user value binds as a
// `{pN:Type}` parameter, and `sql.id` refuses anything off the column whitelist. These
// run offline.

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
const NO_FILTER_CLAUSES = {
  filterClauses: NO_FILTERS,
  latestFilterClauses: NO_FILTERS,
};
/** The outer statement of a page: every column from the newest version of the ids inside. */
const LATEST_COLUMNS_PAGE =
  'SELECT id, argMax(first_name, p.last_seen_at) AS first_name, argMax(last_name, p.last_seen_at) AS last_name, argMax(email, p.last_seen_at) AS email, argMax(avatar, p.last_seen_at) AS avatar, argMax(properties, p.last_seen_at) AS properties, project_id, argMax(is_external, p.last_seen_at) AS is_external, argMax(created_at, p.last_seen_at) AS created_at, max(p.last_seen_at) AS last_seen_at, argMax(groups, p.last_seen_at) AS groups FROM profiles AS p';
/** The inner id query of a page or count up to `end`, with its placeholders unnumbered. */
function innerIdsOf(text: string, end: number): string {
  return text
    .slice(text.indexOf('SELECT id FROM profiles WHERE'), end)
    .replace(/\{p\d+:/g, '{p:');
}
const WINDOW = {
  startDate: '2026-06-16 00:00:00',
  endDate: '2026-09-16 23:59:59',
};
const COLUMN_LIST = PROFILE_COLUMNS.join(', ');

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
      `SELECT ${COLUMN_LIST} FROM profiles WHERE id = {p1:String} AND project_id = {p2:String} ORDER BY last_seen_at DESC LIMIT 1`
    );
    expect(byId.query_params).toEqual({ p1: HOSTILE, p2: PROJECT_ID });
    expect(collapse(row.query)).toBe(
      `SELECT ${COLUMN_LIST} FROM profiles WHERE project_id = {p1:String} AND id = {p2:String} ORDER BY last_seen_at DESC LIMIT 1`
    );
    expect(row.query_params).toEqual({ p1: PROJECT_ID, p2: HOSTILE });
  });

  test('profilesByIdsQuery picks the newest version per id, binding ids as one Array(String)', () => {
    const { query, query_params } = profilesByIdsQuery({
      projectId: PROJECT_ID,
      ids: ['a', HOSTILE],
    }).toStatement();

    expect(collapse(query)).toContain(
      'FROM profiles AS p WHERE p.project_id = {p1:String} AND p.id IN {p2:Array(String)} GROUP BY p.id, p.project_id'
    );
    expect(query).toContain('argMax(properties, p.last_seen_at) AS properties');
    expect(query).not.toContain('FINAL');
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
  test('plain page: newest version of the ids in the window, no OFFSET at offset 0', () => {
    const { query, query_params } = profileListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
      ...NO_FILTER_CLAUSES,
      ...WINDOW,
    }).toStatement();
    const text = collapse(query);

    expect(text).toBe(
      `${LATEST_COLUMNS_PAGE} WHERE p.project_id = {p1:String} AND p.id IN (SELECT id FROM profiles WHERE project_id = {p2:String} AND created_at BETWEEN toDateTime({p3:String}) AND toDateTime({p4:String}) GROUP BY id ORDER BY argMax(created_at, last_seen_at) DESC LIMIT {p5:UInt64}) GROUP BY p.id, p.project_id ORDER BY created_at DESC`
    );
    expect(text).not.toContain('FINAL');
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: PROJECT_ID,
      p3: '2026-06-16 00:00:00',
      p4: '2026-09-16 23:59:59',
      p5: 50,
    });
  });

  test('search + isExternal + filters + offset all splice in a stable order', () => {
    const { query, query_params } = profileListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 100,
      search: 'ann',
      isExternal: true,
      filterClauses: { f0: sql`(properties['plan'] = 'pro')` },
      latestFilterClauses: {
        f0: sql`(argMax(properties['plan'], last_seen_at) = 'pro')`,
      },
      ...WINDOW,
    }).toStatement();
    const text = collapse(query);

    // The raw-row conditions only narrow the id set (a superset); the same
    // conditions on the newest version decide, in HAVING.
    expect(text).toContain(
      "(SELECT id FROM profiles WHERE project_id = {p2:String} AND cityHash64(id) IN (SELECT cityHash64(id) FROM profiles WHERE project_id = {p3:String} AND ((id ILIKE {p4:String} OR email ILIKE {p5:String} OR first_name ILIKE {p6:String} OR last_name ILIKE {p7:String} OR concat(first_name, ' ', last_name) ILIKE {p8:String})) AND is_external = {p9:Bool} AND (properties['plan'] = 'pro')) GROUP BY id HAVING ((id ILIKE {p10:String} OR argMax(email, last_seen_at) ILIKE {p11:String} OR argMax(first_name, last_seen_at) ILIKE {p12:String} OR argMax(last_name, last_seen_at) ILIKE {p13:String} OR concat(argMax(first_name, last_seen_at), ' ', argMax(last_name, last_seen_at)) ILIKE {p14:String})) AND argMax(is_external, last_seen_at) = {p15:Bool} AND (argMax(properties['plan'], last_seen_at) = 'pro') ORDER BY argMax(created_at, last_seen_at) DESC LIMIT {p16:UInt64} OFFSET {p17:UInt64})"
    );
    expect(query_params).toMatchObject({
      p1: PROJECT_ID,
      p4: '%ann%',
      p9: true,
      p10: '%ann%',
      p15: true,
      p16: 50,
      p17: 100,
    });
  });

  test('a search reaches past the window; one shorter than the minimum is ignored', () => {
    const page = (search: string) =>
      collapse(
        profileListQuery({
          projectId: PROJECT_ID,
          take: 50,
          offset: 0,
          search,
          ...NO_FILTER_CLAUSES,
          ...WINDOW,
        }).toStatement().query
      );
    const unsearched = page('');

    expect(page('an')).not.toContain('created_at BETWEEN');
    expect(page('an')).toContain('ILIKE');
    expect(page(' a ')).toBe(unsearched);
    expect(unsearched).toContain('created_at BETWEEN');
  });

  test('count counts exactly the ids the page selects from', () => {
    const list = {
      projectId: PROJECT_ID,
      search: 'ann',
      isExternal: false,
      filterClauses: { f0: sql`(email != '')` },
      latestFilterClauses: { f0: sql`(argMax(email, last_seen_at) != '')` },
      ...WINDOW,
    };
    const page = collapse(
      profileListQuery({ ...list, take: 1, offset: 0 }).toStatement().query
    );
    const count = collapse(profileListCountQuery(list).toStatement().query);

    expect(count).toStartWith(
      'SELECT count() as count FROM (SELECT id FROM profiles WHERE'
    );
    expect(count).not.toContain('FINAL');
    expect(innerIdsOf(count, count.lastIndexOf(')'))).toBe(
      innerIdsOf(page, page.indexOf(' ORDER BY'))
    );
  });
});

describe('findProfilesQuery', () => {
  const base = {
    projectId: PROJECT_ID,
    ...NO_FILTER_CLAUSES,
    sortOrder: 'desc' as const,
    limit: 25,
  };

  test('minimal: project guard, DESC, bound limit', () => {
    const { query, query_params } = findProfilesQuery(base).toStatement();

    expect(collapse(query)).toBe(
      `${LATEST_COLUMNS_PAGE} WHERE p.project_id = {p1:String} AND p.id IN (SELECT id FROM profiles WHERE project_id = {p2:String} GROUP BY id ORDER BY argMax(created_at, last_seen_at) DESC LIMIT {p3:UInt64}) GROUP BY p.id, p.project_id ORDER BY created_at DESC`
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: PROJECT_ID, p3: 25 });
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
      latestFilterClauses: { f0: sql`(2 = 2)` },
    }).toStatement();
    const text = collapse(query);

    // The id-level conditions filter rows; the column conditions narrow the
    // candidate ids on the raw rows and decide on the newest version in HAVING.
    expect(text).toContain(
      "AND id NOT IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p3:String} AND profile_id != '' AND created_at >= now() - INTERVAL {p4:UInt64} DAY )"
    );
    expect(text).toContain(
      "AND id IN ( SELECT profile_id FROM sessions WHERE project_id = {p5:String} AND sign = 1 AND profile_id != '' GROUP BY profile_id HAVING count() >= {p6:UInt64} )"
    );
    expect(text).toContain(
      'AND id IN ( SELECT DISTINCT profile_id FROM events WHERE project_id = {p7:String} AND name = {p8:String} )'
    );
    expect(text).toContain(
      'AND cityHash64(id) IN (SELECT cityHash64(id) FROM profiles WHERE project_id = {p9:String} AND email ILIKE {p10:String} AND ((id ILIKE {p11:String}'
    );
    expect(text).toContain(
      'AND properties[{p16:String}] = {p17:String} AND properties[{p18:String}] = {p19:String} AND properties[{p20:String}] = {p21:String} AND properties[{p22:String}] = {p23:String} AND (1 = 1)) GROUP BY id HAVING argMax(email, last_seen_at) ILIKE {p24:String}'
    );
    expect(text).toContain(
      'AND argMax(properties, last_seen_at)[{p30:String}] = {p31:String}'
    );
    expect(text).toEndWith(
      'AND (2 = 2) ORDER BY argMax(created_at, last_seen_at) ASC LIMIT {p38:UInt64}) GROUP BY p.id, p.project_id ORDER BY created_at ASC'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toMatchObject({
      p4: 7,
      p6: 3,
      p8: HOSTILE,
      p10: `%${HOSTILE}%`,
      p16: 'country',
      p17: 'SE',
      p18: 'city',
      p19: HOSTILE,
      p24: `%${HOSTILE}%`,
      p38: 25,
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
    expect(zero).toContain('INTERVAL {p4:UInt64} DAY');
    expect(zero).toContain('HAVING count() >= {p6:UInt64}');
  });
});

describe('project-wide vocab', () => {
  test('property keys keeps the is_external guard and no FINAL', () => {
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
