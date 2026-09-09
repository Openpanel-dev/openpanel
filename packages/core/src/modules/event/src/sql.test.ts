// Shape tests for the event module's fragments: every user value binds as a
// `{pN:Type}` parameter (nothing is interpolated), the optional clauses and
// joins toggle exactly on V1's conditions, and `sql.id` refuses anything off
// the column whitelists. Result-set equivalence against V1 is not tested here
// (these run offline); it is recorded per query in sql.proof.md.

import { describe, expect, test } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import { EVENT_LIST_COLUMNS, type EventListColumn } from '../event.constants';
import {
  botEventsCountQuery,
  botEventsQuery,
  eventByIdQuery,
  eventListQuery,
  eventPropertiesQuery,
  eventPropertyValuesQuery,
  eventsCountQuery,
  NO_FILTER_JOINS,
  queryEventsQuery,
  topEventNamesQuery,
  topOriginsQuery,
  topPagesQuery,
} from './sql';

const PROJECT_ID = 'proj-1';
const HOSTILE = "x' OR 1=1 --";
const NO_FILTERS = {};
const CURSOR = new Date('2026-09-01T12:34:56.789Z');
const START = new Date('2026-08-01T00:00:00.000Z');
const END = new Date('2026-08-31T23:59:59.000Z');

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('eventListQuery', () => {
  const minimal = {
    projectId: PROJECT_ID,
    columns: ['created_at', 'id', 'name'] as const,
    take: 50,
    filterClauses: NO_FILTERS,
    joins: NO_FILTER_JOINS,
  };

  test('minimal: whitelisted columns, project guard, no OFFSET, no joins', () => {
    const { query, query_params } = eventListQuery(minimal).toStatement();

    expect(query).toBe(
      'SELECT created_at, id, name FROM events e WHERE project_id = {p1:String} ORDER BY created_at DESC, id ASC LIMIT {p2:UInt64}'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 50 });
  });

  test('every EVENT_LIST_COLUMNS entry projects; anything else throws', () => {
    const { query } = eventListQuery({
      ...minimal,
      columns: EVENT_LIST_COLUMNS,
    }).toStatement();
    expect(query).toStartWith(`SELECT ${EVENT_LIST_COLUMNS.join(', ')} FROM`);

    expect(() =>
      eventListQuery({
        ...minimal,
        columns: ['id', HOSTILE as EventListColumn],
      })
    ).toThrow();
  });

  test('numeric paging: OFFSET only when non-zero', () => {
    const first = eventListQuery({ ...minimal, offset: 0 }).toStatement();
    const later = eventListQuery({ ...minimal, offset: 100 }).toStatement();

    expect(first.query).toEndWith('LIMIT {p2:UInt64}');
    expect(later.query).toEndWith('LIMIT {p2:UInt64} OFFSET {p3:UInt64}');
    expect(later.query_params.p3).toBe(100);
  });

  test('date cursor: lookback anchors on the cursor, then the strict upper bound', () => {
    const { query, query_params } = eventListQuery({
      ...minimal,
      cursor: CURSOR,
      lookbackDays: 7,
    }).toStatement();

    expect(query).toContain(
      'WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND created_at < {p3:String} AND project_id = {p4:String}'
    );
    expect(query_params).toMatchObject({
      p1: '2026-09-01 12:34:56',
      p2: 7,
      p3: '2026-09-01 12:34:56',
      p4: PROJECT_ID,
    });
  });

  test('lookback without a cursor anchors on now', () => {
    const before = Date.now();
    const { query, query_params } = eventListQuery({
      ...minimal,
      lookbackDays: 30,
    }).toStatement();

    expect(query).toContain(
      'WHERE created_at >= toDateTime64({p1:String}, 3) - INTERVAL {p2:Float64} DAY AND project_id = {p3:String}'
    );
    const anchor = new Date(`${String(query_params.p1).replace(' ', 'T')}Z`);
    expect(Math.abs(anchor.getTime() - before)).toBeLessThan(5000);
  });

  test('every scope condition binds in V1 order and none interpolates', () => {
    const { query, query_params } = eventListQuery({
      ...minimal,
      profileId: HOSTILE,
      sessionId: 'sess-1',
      groupId: 'grp-1',
      cohortId: 'coh-1',
      startDate: START,
      endDate: END,
      events: ['a', HOSTILE],
      filterClauses: { f0: sql`(path = '/')` },
      conversionNames: ['signup'],
    }).toStatement();

    expect(query).toBe(
      "SELECT created_at, id, name FROM events e WHERE project_id = {p1:String} AND ((device_id IN (SELECT device_id as did FROM events WHERE project_id = {p2:String} AND device_id != '' AND profile_id = {p3:String} group by did) AND profile_id = device_id) OR profile_id = {p4:String}) AND session_id = {p5:String} AND has(groups, {p6:String}) AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p7:String} AND project_id = {p8:String}) AND toDate(created_at) BETWEEN toDate({p9:String}) AND toDate({p10:String}) AND name IN {p11:Array(String)} AND (path = '/') AND name IN {p12:Array(String)} ORDER BY created_at DESC, id ASC LIMIT {p13:UInt64}"
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: PROJECT_ID,
      p3: HOSTILE,
      p4: HOSTILE,
      p5: 'sess-1',
      p6: 'grp-1',
      p7: 'coh-1',
      p8: PROJECT_ID,
      p9: '2026-08-01 00:00:00',
      p10: '2026-08-31 23:59:59',
      p11: ['a', HOSTILE],
      p12: ['signup'],
      p13: 50,
    });
  });

  test('empty events / conversionNames lists add no clause', () => {
    const { query } = eventListQuery({
      ...minimal,
      events: [],
      conversionNames: [],
    }).toStatement();
    expect(query).not.toContain('name IN');
  });

  test('profile join projects only whitelisted columns; group join adds ARRAY JOIN', () => {
    const { query, query_params } = eventListQuery({
      ...minimal,
      joins: { profileColumns: ['email', 'properties'], groups: true },
    }).toStatement();

    expect(query).toContain(
      'FROM events e LEFT ANY JOIN (SELECT id, email, properties FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM groups FINAL WHERE project_id = {p2:String}) AS _g ON _g.id = _group_id WHERE project_id = {p3:String}'
    );
    expect(query_params).toMatchObject({ p1: PROJECT_ID, p2: PROJECT_ID });

    expect(() =>
      eventListQuery({
        ...minimal,
        joins: { profileColumns: ['project_id'], groups: false },
      })
    ).toThrow();
  });
});

describe('eventsCountQuery', () => {
  test('uses a plain profile_id equality, not the stitching subquery', () => {
    const { query, query_params } = eventsCountQuery({
      projectId: PROJECT_ID,
      profileId: HOSTILE,
      groupId: 'grp-1',
      cohortId: 'coh-1',
      startDate: START,
      endDate: END,
      events: ['a'],
      filterClauses: { f0: sql`(path = '/')` },
      joins: NO_FILTER_JOINS,
    }).toStatement();

    expect(query).toBe(
      "SELECT count(*) as count FROM events e WHERE project_id = {p1:String} AND profile_id = {p2:String} AND has(groups, {p3:String}) AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p4:String} AND project_id = {p5:String}) AND toDate(created_at) BETWEEN toDate({p6:String}) AND toDate({p7:String}) AND name IN {p8:Array(String)} AND (path = '/')"
    );
    expect(query).not.toContain('device_id IN');
    expect(query_params).toMatchObject({ p1: PROJECT_ID, p2: HOSTILE });
  });

  test('shares the filter joins with the list', () => {
    const { query } = eventsCountQuery({
      projectId: PROJECT_ID,
      filterClauses: NO_FILTERS,
      joins: { profileColumns: ['email'], groups: false },
    }).toStatement();

    expect(query).toContain(
      'FROM events e LEFT ANY JOIN (SELECT id, email FROM profiles FINAL WHERE project_id = {p1:String}) as profile on profile.id = profile_id WHERE'
    );
  });
});

describe('single-event lookups', () => {
  test('eventByIdQuery: ±1s window only with createdAt', () => {
    const bare = eventByIdQuery({
      projectId: PROJECT_ID,
      id: HOSTILE,
    }).toStatement();
    const windowed = eventByIdQuery({
      projectId: PROJECT_ID,
      id: HOSTILE,
      createdAt: CURSOR,
    }).toStatement();

    expect(bare.query).toBe(
      'SELECT * FROM events WHERE project_id = {p1:String} AND id = {p2:String} LIMIT 1'
    );
    expect(bare.query_params).toEqual({ p1: PROJECT_ID, p2: HOSTILE });
    expect(windowed.query).toBe(
      'SELECT * FROM events WHERE project_id = {p1:String} AND created_at BETWEEN {p2:String} AND {p3:String} AND id = {p4:String} LIMIT 1'
    );
    expect(windowed.query_params).toEqual({
      p1: PROJECT_ID,
      p2: '2026-09-01 12:34:55',
      p3: '2026-09-01 12:34:57',
      p4: HOSTILE,
    });
  });
});

describe('vocab queries', () => {
  test('topEventNamesQuery reads the MV with a bound limit', () => {
    const { query, query_params } =
      topEventNamesQuery(PROJECT_ID).toStatement();
    expect(query).toBe(
      'SELECT name, count() as count FROM distinct_event_names_mv WHERE project_id = {p1:String} GROUP BY name ORDER BY count DESC LIMIT {p2:UInt64}'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 50 });
  });

  test('eventPropertiesQuery: optional name clause, GROUP BY not DISTINCT', () => {
    const all = eventPropertiesQuery({ projectId: PROJECT_ID }).toStatement();
    const one = eventPropertiesQuery({
      projectId: PROJECT_ID,
      eventName: HOSTILE,
    }).toStatement();

    expect(all.query).toBe(
      'SELECT property_key, name as event_name FROM event_property_values_mv WHERE project_id = {p1:String} GROUP BY property_key, name ORDER BY property_key ASC, name ASC LIMIT {p2:UInt64}'
    );
    expect(one.query).toContain(
      'WHERE project_id = {p1:String} AND name = {p2:String} GROUP BY'
    );
    expect(one.query_params).toEqual({ p1: PROJECT_ID, p2: HOSTILE, p3: 500 });
  });

  test('eventPropertyValuesQuery binds all three keys', () => {
    const { query, query_params } = eventPropertyValuesQuery({
      projectId: PROJECT_ID,
      eventName: 'signup',
      propertyKey: HOSTILE,
    }).toStatement();
    expect(query).toBe(
      'SELECT property_value as value FROM event_property_values_mv WHERE project_id = {p1:String} AND name = {p2:String} AND property_key = {p3:String} ORDER BY created_at DESC LIMIT {p4:UInt64}'
    );
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: 'signup',
      p3: HOSTILE,
      p4: 200,
    });
  });
});

describe('queryEventsQuery', () => {
  test('minimal: project guard and limit', () => {
    const { query, query_params } = queryEventsQuery({
      projectId: PROJECT_ID,
      equals: {},
      filterClauses: NO_FILTERS,
      limit: 100,
    }).toStatement();
    expect(query).toBe(
      'SELECT * FROM events WHERE project_id = {p1:String} LIMIT {p2:UInt64}'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 100 });
  });

  test('equality columns follow V1 order regardless of input order; keys bind too', () => {
    const { query, query_params } = queryEventsQuery({
      projectId: PROJECT_ID,
      sessionId: 'sess-1',
      profileId: 'prof-1',
      profileIds: ['a', 'b'],
      eventNames: ['x'],
      equals: { browser: 'Firefox', path: HOSTILE, country: 'SE' },
      properties: { [HOSTILE]: 'v' },
      dateRange: { start: '2026-08-01 00:00:00', end: '2026-08-31 23:59:59' },
      filterClauses: { f0: sql`(1 = 1)` },
      limit: 10,
    }).toStatement();

    expect(query).toBe(
      'SELECT * FROM events WHERE project_id = {p1:String} AND session_id = {p2:String} AND profile_id = {p3:String} AND profile_id IN {p4:Array(String)} AND name IN {p5:Array(String)} AND path = {p6:String} AND country = {p7:String} AND browser = {p8:String} AND properties[{p9:String}] = {p10:String} AND created_at BETWEEN {p11:String} AND {p12:String} AND (1 = 1) LIMIT {p13:UInt64}'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toMatchObject({
      p6: HOSTILE,
      p7: 'SE',
      p8: 'Firefox',
      p9: HOSTILE,
      p10: 'v',
    });
  });
});

describe('the trpc router queries', () => {
  test('topPagesQuery: 30-day window, optional ILIKE, always OFFSET', () => {
    const plain = collapse(
      topPagesQuery({
        projectId: PROJECT_ID,
        take: 20,
        offset: 0,
      }).toStatement().query
    );
    const searched = topPagesQuery({
      projectId: PROJECT_ID,
      take: 20,
      offset: 40,
      search: HOSTILE,
    }).toStatement();

    expect(plain).toContain(
      "WHERE name = 'screen_view' AND project_id = {p1:String} AND created_at > now() - INTERVAL {p2:UInt64} DAY GROUP BY path, project_id, origin ORDER BY count desc LIMIT {p3:UInt64} OFFSET {p4:UInt64}"
    );
    expect(collapse(searched.query)).toContain(
      'DAY AND path ILIKE {p3:String} GROUP BY'
    );
    expect(searched.query).not.toContain(HOSTILE);
    expect(searched.query_params).toEqual({
      p1: PROJECT_ID,
      p2: 30,
      p3: `%${HOSTILE}%`,
      p4: 20,
      p5: 40,
    });
  });

  test('bot events page + count read events_bots', () => {
    const page = botEventsQuery({
      projectId: PROJECT_ID,
      limit: 8,
      offset: 16,
    }).toStatement();
    const count = botEventsCountQuery(PROJECT_ID).toStatement();

    expect(page.query).toBe(
      'SELECT * FROM events_bots WHERE project_id = {p1:String} ORDER BY created_at DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}'
    );
    expect(page.query_params).toEqual({ p1: PROJECT_ID, p2: 8, p3: 16 });
    expect(count.query).toBe(
      'SELECT count(*) as count FROM events_bots WHERE project_id = {p1:String}'
    );
  });

  test('topOriginsQuery keeps the 30-day window and top 3', () => {
    const { query, query_params } = topOriginsQuery(PROJECT_ID).toStatement();
    expect(query).toBe(
      "SELECT DISTINCT origin, count(id) as count FROM events WHERE project_id = {p1:String} AND origin IS NOT NULL AND origin != '' AND toDate(created_at) > now() - INTERVAL {p2:UInt64} DAY GROUP BY origin ORDER BY count DESC LIMIT {p3:UInt64}"
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 30, p3: 3 });
  });
});
