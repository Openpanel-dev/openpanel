// SQL-shape tests for the cohort detail page's `mostEvents` / `popularRoutes`
// statements, which are bounded to a window.

import { describe, expect, test } from 'bun:test';
import {
  cohortMemberEventsQuery,
  cohortMemberRoutesQuery,
} from '../cohort.service';

const PROJECT_ID = 'proj-1';
const COHORT_ID = 'cohort-1';
const LIMIT = 10;
const WINDOW = {
  startDate: '2026-06-16 00:00:00',
  endDate: '2026-09-17 00:00:00',
};
const WHITESPACE_RUNS = /\s+/g;
const BOUND_WINDOW =
  'created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String})';
const MEMBER_IDS =
  'profile_id IN ( SELECT profile_id FROM cohort_members FINAL WHERE cohort_id = {p4:String} AND project_id = {p5:String} )';

function collapse(text: string): string {
  return text.replace(WHITESPACE_RUNS, ' ').trim();
}

const EXPECTED_PARAMS = {
  p1: PROJECT_ID,
  p2: WINDOW.startDate,
  p3: WINDOW.endDate,
  p4: COHORT_ID,
  p5: PROJECT_ID,
  p6: LIMIT,
};

describe('cohortMemberEventsQuery', () => {
  test('bounds the event scan to the window, right after project_id', () => {
    const { query, query_params } = cohortMemberEventsQuery(
      PROJECT_ID,
      COHORT_ID,
      WINDOW,
      LIMIT
    ).toStatement();

    expect(collapse(query)).toBe(
      `SELECT name, count() AS count FROM events WHERE project_id = {p1:String} AND ${BOUND_WINDOW} AND ${MEMBER_IDS} AND name NOT IN ('screen_view', 'session_start', 'session_end') GROUP BY name ORDER BY count DESC LIMIT {p6:UInt64}`
    );
    expect(query_params).toEqual(EXPECTED_PARAMS);
  });
});

describe('cohortMemberRoutesQuery', () => {
  test('bounds the screen_view scan to the window, right after project_id', () => {
    const { query, query_params } = cohortMemberRoutesQuery(
      PROJECT_ID,
      COHORT_ID,
      WINDOW,
      LIMIT
    ).toStatement();

    expect(collapse(query)).toBe(
      `SELECT path, count() AS count FROM events WHERE project_id = {p1:String} AND ${BOUND_WINDOW} AND ${MEMBER_IDS} AND name = 'screen_view' AND path != '' GROUP BY path ORDER BY count DESC LIMIT {p6:UInt64}`
    );
    expect(query_params).toEqual(EXPECTED_PARAMS);
  });
});

test('the window reaches ClickHouse as bound params, not SQL text', () => {
  const { query } = cohortMemberEventsQuery(
    PROJECT_ID,
    COHORT_ID,
    WINDOW,
    LIMIT
  ).toStatement();

  expect(query).not.toContain(WINDOW.startDate);
  expect(query).not.toContain(WINDOW.endDate);
});
