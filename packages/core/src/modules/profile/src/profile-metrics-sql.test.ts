// SQL-shape tests for the profile metrics query. Ported from
// packages/db/src/services/profile-metrics-sql.test.ts (M7-002) — minus its
// itCH ClickHouse-reachability EXPLAIN check, for the reason
// cohort-sql.test.ts's header gives (a sibling file's client mock applies
// process-wide). The rendered statement was EXPLAINed and result-diffed
// against V1 on the local prod-copy by hand instead — see the EXPLAIN section
// and the profileMetricsQuery case in profile.sql.proof.md. V1's
// "escapes the identifiers" test becomes "binds the identifiers": the `sql`
// tag never interpolates, so the hostile value can only appear in the params.

import { describe, expect, test } from 'bun:test';
import { profileMetricsQuery } from './profile.sql';

const PROJECT_ID = 'test-sql-validation';
const PROFILE_ID = 'profile-1';

const METRICS = [
  'lastSeen',
  'firstSeen',
  'screenViews',
  'sessions',
  'durationAvg',
  'durationP90',
  'totalEvents',
  'uniqueDaysActive',
  'bounceRate',
  'avgEventsPerSession',
  'conversionEvents',
  'avgTimeBetweenSessions',
  'revenue',
];

function render() {
  return profileMetricsQuery({
    profileId: PROFILE_ID,
    projectId: PROJECT_ID,
  }).toStatement();
}

describe('profileMetricsQuery', () => {
  // Every metric is a plain aggregate over the same
  // `profile_id = X AND project_id = Y` slice, so the query must read the
  // events table exactly once — the per-metric-CTE shape scanned it eight
  // times per profile view.
  test('scans the events table exactly once', () => {
    const { query } = render();
    expect(query.match(/FROM events\b/g)).toHaveLength(1);
    expect(query.match(/FROM profiles\b/g)).toHaveLength(1);
  });

  test('keeps every metric of the old per-CTE shape', () => {
    const { query } = render();
    for (const metric of METRICS) {
      expect(query).toContain(`as ${metric}`);
    }
  });

  test('binds the identifiers instead of interpolating them', () => {
    const hostileProfile = "p'--";
    const hostileProject = "x'--";
    const { query, query_params } = profileMetricsQuery({
      profileId: hostileProfile,
      projectId: hostileProject,
    }).toStatement();

    expect(query).not.toContain(hostileProfile);
    expect(query).not.toContain(hostileProject);
    expect(query).toContain(
      'WHERE id = {p1:String} AND project_id = {p2:String}'
    );
    expect(query).toContain(
      'WHERE profile_id = {p3:String} AND project_id = {p4:String}'
    );
    expect(query_params).toEqual({
      p1: hostileProfile,
      p2: hostileProject,
      p3: hostileProfile,
      p4: hostileProject,
    });
  });
});
