import { round } from '@openpanel/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  RETENTION_BLUEPRINT,
  RETENTION_FIXTURE,
  setupRetentionFixtures,
  teardownRetentionFixtures,
} from '../../../../test/retention-fixtures';
import { TABLE_NAMES, chQuery } from '../clickhouse/client';
import {
  getRetentionCohort,
  getRetentionSeries,
  type IRetentionCohortRow,
  processCohortData,
} from './retention.service';

const PROJECT_ID = 'test-retention-cohort';
const { day, week } = RETENTION_FIXTURE;

// Keep only the per-cohort rows (drop the leading "Weighted Average" row) and
// the fields the blueprint pins down.
function cohortsOnly(rows: IRetentionCohortRow[]) {
  return rows
    .filter((row) => row.cohort_interval !== 'Weighted Average')
    .map(({ cohort_interval, sum, values }) => ({
      cohort_interval,
      sum,
      values,
    }));
}

describe('getRetentionCohort', () => {
  beforeAll(async () => {
    await setupRetentionFixtures(PROJECT_ID);
  });

  afterAll(async () => {
    await teardownRetentionFixtures(PROJECT_ID);
  });

  it('matches the blueprint for day interval, criteria "on"', async () => {
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
    });

    expect(cohortsOnly(rows)).toEqual(RETENTION_BLUEPRINT.dayOn);
  });

  it('matches the blueprint for day interval, criteria "on_or_after"', async () => {
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on_or_after',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
    });

    expect(cohortsOnly(rows)).toEqual(RETENTION_BLUEPRINT.dayOnOrAfter);
  });

  it('counts retention across the year boundary (week interval)', async () => {
    // The old toWeek() implementation returned week-of-year (resets each Jan),
    // so a 2024-W52 -> 2025-W01 return produced a negative diff and was dropped.
    // This locks the year-aware behavior.
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'week',
      startDate: week.start,
      endDate: week.end,
    });

    expect(cohortsOnly(rows)).toEqual(RETENTION_BLUEPRINT.weekOn);
  });

  it('prepends a weighted-average row that is 100% retained at interval 0', async () => {
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
    });

    expect(rows[0]?.cohort_interval).toBe('Weighted Average');
    expect(rows[0]?.percentages[0]).toBe(1);
  });

  it('assigns each user to a single first-touch cohort (no double-counting)', async () => {
    const rows = cohortsOnly(
      await getRetentionCohort({
        projectId: PROJECT_ID,
        firstEvent: ['app_open'],
        secondEvent: ['app_open'],
        criteria: 'on',
        interval: 'day',
        startDate: day.start,
        endDate: day.end,
      })
    );

    // Only D0 and D1 are real cohorts. There is NO D2 cohort: every user who
    // fired app_open on D2 (RU1, RU2, RU4) already belongs to an earlier cohort.
    expect(rows.map((row) => row.cohort_interval)).toEqual([day.d0, day.d1]);

    // Characterize the bug we fixed: the legacy "every-occurrence" cohorting
    // (no GROUP BY profile_id dedup) places recurring users in every day they
    // were active, producing a spurious D2 cohort and inflated sizes.
    const legacy = await chQuery<{ cohort_interval: string; size: number }>(`
      SELECT toDate(created_at) AS cohort_interval, COUNT(DISTINCT profile_id) AS size
      FROM ${TABLE_NAMES.cohort_events_mv}
      WHERE project_id = '${PROJECT_ID}'
        AND name = 'app_open'
        AND created_at BETWEEN toDate('${day.start}') AND toDate('${day.end}')
      GROUP BY cohort_interval
      ORDER BY cohort_interval ASC
    `);

    // 3 day-buckets, each with 3 distinct users => sizes sum to 9 for only 5
    // real users. First-touch collapses this to 3 + 2 = 5.
    expect(legacy.map((r) => r.size)).toEqual([3, 3, 3]);
    const firstTouchTotal = rows.reduce((acc, row) => acc + row.sum, 0);
    expect(firstTouchTotal).toBe(5);
  });

  it('supports any-event (active-user) retention when no event names given', async () => {
    const named = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
    });
    const anyEvent = await getRetentionCohort({
      projectId: PROJECT_ID,
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
    });

    // In the day window the only non-app_open events are RU1's purchase (D1)
    // and RU2's purchase (D2). Those users are already active via app_open on
    // those days, so "any event" yields the same cohort sizes as app_open.
    expect(cohortsOnly(anyEvent).map((r) => r.sum)).toEqual(
      cohortsOnly(named).map((r) => r.sum)
    );
  });

  it('applies a property filter via the raw-events fallback path', async () => {
    // country = US drops RU3 (SE) from the D0 cohort. This filter references an
    // event column not present in cohort_events_mv, so the engine must fall
    // back to the raw events table.
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
      filters: [{ name: 'country', operator: 'is', value: ['US'] }],
    });

    expect(cohortsOnly(rows)).toEqual(RETENTION_BLUEPRINT.countryUsOn);
  });

  it('scopes to a saved cohort via the fast MV path (inCohort)', async () => {
    // inCohort only needs profile_id, so this stays on cohort_events_mv. The
    // cohort contains RU1 and RU4, leaving one user in each of D0 and D1.
    const rows = await getRetentionCohort({
      projectId: PROJECT_ID,
      firstEvent: ['app_open'],
      secondEvent: ['app_open'],
      criteria: 'on',
      interval: 'day',
      startDate: day.start,
      endDate: day.end,
      filters: [
        {
          name: 'cohort',
          operator: 'inCohort',
          value: [],
          cohortIds: [RETENTION_FIXTURE.cohort.id],
        },
      ],
    });

    expect(cohortsOnly(rows)).toEqual(RETENTION_BLUEPRINT.cohortOn);
  });
});

describe('getRetentionSeries', () => {
  beforeAll(async () => {
    await setupRetentionFixtures(PROJECT_ID);
  });

  afterAll(async () => {
    await teardownRetentionFixtures(PROJECT_ID);
  });

  it('computes week-over-week active-user retention', async () => {
    const rows = await getRetentionSeries({ projectId: PROJECT_ID });
    expect(rows).toEqual(RETENTION_BLUEPRINT.weeklySeries);
  });
});

describe('processCohortData weighted average (pure)', () => {
  // Three weekly cohorts; reference date is 3 weeks after the oldest, so the
  // newer cohorts have not yet reached the later periods.
  const data = [
    {
      cohort_interval: '2024-01-07',
      total_first_event_count: 100,
      interval_0_user_count: 100,
      interval_1_user_count: 50,
      interval_2_user_count: 25,
      interval_3_user_count: 10,
    },
    {
      cohort_interval: '2024-01-14',
      total_first_event_count: 80,
      interval_0_user_count: 80,
      interval_1_user_count: 40,
      interval_2_user_count: 0, // genuine zero (mature) — must count
      interval_3_user_count: 0,
    },
    {
      cohort_interval: '2024-01-21',
      total_first_event_count: 60,
      interval_0_user_count: 60,
      interval_1_user_count: 30,
      interval_2_user_count: 0, // not yet mature — must be excluded
      interval_3_user_count: 0,
    },
  ];

  it('pools only mature cohorts and is internally consistent', () => {
    const rows = processCohortData(data, 3, 'week', '2024-01-28 00:00:00');
    const avg = rows[0]!;

    expect(avg.cohort_interval).toBe('Weighted Average');
    // Period 0 equals Total profiles and the curve starts at 100%.
    expect(avg.sum).toBe(80);
    expect(avg.values[0]).toBe(80);
    expect(avg.percentages[0]).toBe(1);
    // Period 2 pools C0+C1 only (C2 is immature). C1's genuine zero is included,
    // so it's 25/180 = 0.14 — NOT 25/100 = 0.25 (the old "exclude zeros" bug).
    expect(avg.percentages[2]).toBe(0.14);
    // Period 3 pools only C0 (C1, C2 immature): 10/100 = 0.10.
    expect(avg.percentages[3]).toBe(0.1);

    expect(avg.values).toEqual([80, 40, 11, 8]);
    expect(avg.percentages).toEqual([1, 0.5, 0.14, 0.1]);
  });

  it('treats all periods as mature when no reference date is given', () => {
    const rows = processCohortData(data, 3, 'week');
    const avg = rows[0]!;
    // Every cohort counts in every column: period 2 = 25/240, period 3 = 10/240.
    expect(avg.percentages[2]).toBe(round(25 / 240, 2));
    expect(avg.percentages[3]).toBe(round(10 / 240, 2));
  });
});
