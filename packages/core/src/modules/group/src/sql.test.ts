// Shape tests for the group module's fragments: every user value binds as a
// `{pN:Type}` parameter (nothing is interpolated), and the optional clauses
// toggle correctly. Result-set equivalence was proven separately, per query,
// on a local prod-copy — not here; these run offline.

import { describe, expect, test } from 'bun:test';
import {
  groupActivityQuery,
  groupByIdQuery,
  groupEventMetricsQuery,
  groupListCountQuery,
  groupListQuery,
  groupMemberGrowthQuery,
  groupMemberProfilesQuery,
  groupMostEventsQuery,
  groupPopularRoutesQuery,
  groupPropertyKeysQuery,
  groupStatsQuery,
  groupsByIdsQuery,
  groupTypesQuery,
  groupUniqueProfilesQuery,
} from './sql';

const PROJECT_ID = 'proj-1';
const GROUP_ID = 'grp-1';
const HOSTILE = "x' OR 1=1 --";

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('groupListQuery', () => {
  test('plain page: project + deleted guard, no type or search clause', () => {
    const { query, query_params } = groupListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 0,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      'FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0 ORDER BY created_at DESC LIMIT {p2:UInt64} OFFSET {p3:UInt64}'
    );
    expect(text).not.toContain('type =');
    expect(text).not.toContain('ILIKE');
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: 50, p3: 0 });
  });

  test('type + search: both clauses bind, search wraps in %..%', () => {
    const { query, query_params } = groupListQuery({
      projectId: PROJECT_ID,
      take: 50,
      offset: 100,
      type: 'company',
      search: HOSTILE,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      'AND deleted = 0 AND type = {p2:String} AND (name ILIKE {p3:String} OR id ILIKE {p4:String})'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: 'company',
      p3: `%${HOSTILE}%`,
      p4: `%${HOSTILE}%`,
      p5: 50,
      p6: 100,
    });
  });

  test('count shares the exact WHERE of the page', () => {
    const page = collapse(
      groupListQuery({
        projectId: PROJECT_ID,
        take: 1,
        offset: 0,
        type: 'company',
        search: 'acme',
      }).toStatement().query
    );
    const count = collapse(
      groupListCountQuery({
        projectId: PROJECT_ID,
        type: 'company',
        search: 'acme',
      }).toStatement().query
    );
    const whereOf = (text: string) =>
      text.slice(text.indexOf('WHERE')).replace(/ ORDER BY.*$/, '');

    expect(count).toStartWith(
      'SELECT count() as count FROM groups FINAL WHERE'
    );
    expect(whereOf(count)).toBe(whereOf(page));
  });
});

describe('single-group lookups', () => {
  test('groupByIdQuery binds both keys and keeps the deleted guard', () => {
    const { query, query_params } = groupByIdQuery({
      id: HOSTILE,
      projectId: PROJECT_ID,
    }).toStatement();

    expect(collapse(query)).toContain(
      'WHERE project_id = {p1:String} AND id = {p2:String} AND deleted = 0'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: HOSTILE });
  });

  test('groupsByIdsQuery binds the id list as one Array(String) param', () => {
    const { query, query_params } = groupsByIdsQuery({
      projectId: PROJECT_ID,
      ids: ['a', 'b'],
    }).toStatement();

    expect(collapse(query)).toContain('AND id IN {p2:Array(String)}');
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: ['a', 'b'] });
  });

  test('groupStatsQuery only counts identified members', () => {
    const { query, query_params } = groupStatsQuery({
      projectId: PROJECT_ID,
      groupIds: ['a'],
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain('ARRAY JOIN groups AS g');
    expect(text).toContain(
      'AND g IN {p3:Array(String)} AND profile_id != device_id GROUP BY g'
    );
    expect(query_params).toEqual({ p1: PROJECT_ID, p2: ['a'], p3: ['a'] });
  });

  test('groupStatsQuery prefilters base rows before the ARRAY JOIN alias', () => {
    const { query } = groupStatsQuery({
      projectId: PROJECT_ID,
      groupIds: ['a'],
    }).toStatement();

    expect(collapse(query)).toContain(
      'AND hasAny(groups, {p2:Array(String)}) AND g IN {p3:Array(String)}'
    );
  });
});

describe('project-wide vocab', () => {
  test('groupTypesQuery / groupPropertyKeysQuery bind only the project', () => {
    for (const build of [groupTypesQuery, groupPropertyKeysQuery]) {
      const { query, query_params } = build(PROJECT_ID).toStatement();
      expect(collapse(query)).toContain(
        'FROM groups FINAL WHERE project_id = {p1:String} AND deleted = 0'
      );
      expect(query_params).toEqual({ p1: PROJECT_ID });
    }
  });
});

describe('groupMemberProfilesQuery', () => {
  test('no search: window total rides along, no ILIKE', () => {
    const { query, query_params } = groupMemberProfilesQuery({
      projectId: PROJECT_ID,
      groupId: GROUP_ID,
      take: 50,
      offset: 0,
    }).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      'count() OVER () AS total_count FROM profiles FINAL'
    );
    expect(text).toContain(
      'WHERE project_id = {p1:String} AND has(groups, {p2:String}) ORDER BY created_at DESC LIMIT {p3:UInt64} OFFSET {p4:UInt64}'
    );
    expect(text).not.toContain('ILIKE');
    expect(query_params).toEqual({
      p1: PROJECT_ID,
      p2: GROUP_ID,
      p3: 50,
      p4: 0,
    });
  });

  test('search: one %..% pattern bound three times', () => {
    const { query, query_params } = groupMemberProfilesQuery({
      projectId: PROJECT_ID,
      groupId: GROUP_ID,
      take: 50,
      offset: 0,
      search: HOSTILE,
    }).toStatement();

    expect(collapse(query)).toContain(
      'AND (email ILIKE {p3:String} OR first_name ILIKE {p4:String} OR last_name ILIKE {p5:String})'
    );
    expect(query).not.toContain(HOSTILE);
    expect(query_params.p3).toBe(`%${HOSTILE}%`);
    expect(query_params.p5).toBe(`%${HOSTILE}%`);
  });
});

describe('the trpc router queries', () => {
  const ref = { projectId: PROJECT_ID, groupId: HOSTILE };

  test('every per-group query binds project then group and interpolates nothing', () => {
    const builders = [
      groupEventMetricsQuery,
      groupUniqueProfilesQuery,
      groupActivityQuery,
      groupMemberGrowthQuery,
      groupMostEventsQuery,
      groupPopularRoutesQuery,
    ];
    for (const build of builders) {
      const { query, query_params } = build(ref).toStatement();
      expect(collapse(query)).toContain(
        'WHERE project_id = {p1:String} AND has(groups, {p2:String})'
      );
      expect(query).not.toContain(HOSTILE);
      expect(query_params).toMatchObject({ p1: PROJECT_ID, p2: HOSTILE });
    }
  });

  test('memberGrowth keeps the 30-day window and the WITH FILL frame', () => {
    const { query, query_params } = groupMemberGrowthQuery(ref).toStatement();
    const text = collapse(query);

    expect(text).toContain(
      'AND created_at >= now() - INTERVAL {p3:UInt64} DAY GROUP BY date ORDER BY date ASC WITH FILL FROM toDate(now() - INTERVAL {p4:UInt64} DAY) TO toDate(now() + INTERVAL 1 DAY) STEP 1'
    );
    expect(query_params).toMatchObject({ p3: 30, p4: 29 });
  });

  test('mostEvents excludes the lifecycle events; popularRoutes keeps only screen_view', () => {
    const most = collapse(groupMostEventsQuery(ref).toStatement().query);
    const routes = collapse(groupPopularRoutesQuery(ref).toStatement().query);

    expect(most).toContain(
      "AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT {p3:UInt64}"
    );
    expect(routes).toContain(
      "AND name = 'screen_view' GROUP BY path ORDER BY count DESC LIMIT {p3:UInt64}"
    );
  });
});
