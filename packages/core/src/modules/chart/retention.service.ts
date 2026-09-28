// The cohort matrix here is the single source of truth for retention cohorts:
// it powers the dashboard retention chart (via the tRPC `cohort` procedure) as
// well as the MCP / agent / REST retention endpoints.

import { DateTime, round } from '@openpanel/shared';
import { range } from 'ramda';
import type { ServiceDeps, Services } from '../../services';
import type { IChartEventFilter } from '../report/report.constants';
import {
  type IRetentionCriteria,
  type IRetentionInterval,
  type RetentionSeriesQueryInput,
  retentionCohortQuery,
  retentionLastSeenSeriesQuery,
  retentionSeriesQuery,
  rollingActiveUsersQuery,
} from './src/retention.sql';
import { runQuery } from './src/run-query';

export type {
  IRetentionCriteria,
  IRetentionInterval,
} from './src/retention.sql';

/** Days-since-last-seen buckets the engagement summary reports on. */
const ENGAGEMENT_ACTIVE_DAYS = 7;
const ENGAGEMENT_RECENT_DAYS = 14;
const ENGAGEMENT_LAPSING_DAYS = 30;
const ENGAGEMENT_INACTIVE_DAYS = 60;

/** getRetentionCohortCore's fixed window. */
const RETENTION_COHORT_WEEKS = 12;

const ROLLING_ACTIVE_USER_LABELS: Record<number, string> = {
  1: 'DAU',
  7: 'WAU',
  30: 'MAU',
};

const RETENTION_PERCENTAGE_DECIMALS = 2;
const RETENTION_COUNT_DECIMALS = 0;

type IGetWeekRetentionInput = RetentionSeriesQueryInput;

export interface IServiceRetentionRollingActiveUsers {
  date: string;
  users: number;
}

export interface IRetentionCohortRow {
  cohort_interval: string;
  sum: number;
  values: number[];
  percentages: number[];
}

export interface IGetRetentionCohortInput {
  projectId: string;
  /** Event name(s) defining cohort entry. Empty/undefined => any event. */
  firstEvent?: string[];
  /** Event name(s) that count as "returned". Empty/undefined => any event. */
  secondEvent?: string[];
  criteria?: IRetentionCriteria;
  interval?: IRetentionInterval;
  /** ISO or `yyyy-MM-dd HH:mm:ss`. */
  startDate: string;
  /** ISO or `yyyy-MM-dd HH:mm:ss`. */
  endDate: string;
  /**
   * Property and/or cohort filters scoping the analysed events. Cohort
   * membership (inCohort/notInCohort) keeps the fast cohort_events_mv path;
   * any property/column filter falls back to the raw events table.
   */
  filters?: IChartEventFilter[];
}

// Week-over-week retention graph: for each week, how many active users were
// also active the following week.
//
// Instead of self-joining the raw events table (O(events²) per profile), the
// statement first collapses events to one row per (profile, week), then
// self-joins that much smaller set to its next week.
export function getRetentionSeries(
  deps: ServiceDeps,
  input: IGetWeekRetentionInput
) {
  return runQuery<{
    date: string;
    active_users: number;
    retained_users: number;
    retention: number;
  }>(deps, retentionSeriesQuery(input));
}

// https://medium.com/@andre_bodro/how-to-fast-calculating-mau-in-clickhouse-fd793559b229
export function getRollingActiveUsers(
  deps: ServiceDeps,
  { projectId, days }: { projectId: string; days: number }
) {
  return runQuery<IServiceRetentionRollingActiveUsers>(
    deps,
    rollingActiveUsersQuery(projectId, days)
  );
}

export function getRetentionLastSeenSeries(
  deps: ServiceDeps,
  input: IGetWeekRetentionInput
) {
  return runQuery<{
    days: number;
    users: number;
  }>(deps, retentionLastSeenSeriesQuery(input));
}

export async function getRollingActiveUsersCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    days: number;
  }
) {
  const data = await getRollingActiveUsers(deps, input);
  return {
    window_days: input.days,
    label: ROLLING_ACTIVE_USER_LABELS[input.days] ?? `${input.days}d active`,
    series: data,
  };
}

export async function getWeeklyRetentionSeriesCore(
  deps: ServiceDeps,
  input: IGetWeekRetentionInput
) {
  return getRetentionSeries(deps, input);
}

// Weekly active-user retention cohort over the last 12 weeks, computed by the
// unified getRetentionCohort engine. firstEvent/secondEvent are omitted so any
// identified activity counts toward the cohort.
export async function getRetentionCohortCore(
  deps: ServiceDeps,
  projectId: string
) {
  const end = DateTime.now();
  const start = end.minus({ weeks: RETENTION_COHORT_WEEKS });
  return getRetentionCohort(deps, {
    projectId,
    interval: 'week',
    startDate: start.toFormat('yyyy-MM-dd HH:mm:ss'),
    endDate: end.toFormat('yyyy-MM-dd HH:mm:ss'),
  });
}

export async function getEngagementCore(
  deps: ServiceDeps,
  input: IGetWeekRetentionInput
) {
  const raw = await getRetentionLastSeenSeries(deps, input);

  let active_0_7 = 0;
  let active_8_14 = 0;
  let active_15_30 = 0;
  let active_31_60 = 0;
  let churned_60_plus = 0;

  for (const row of raw) {
    if (row.days <= ENGAGEMENT_ACTIVE_DAYS) {
      active_0_7 += row.users;
    } else if (row.days <= ENGAGEMENT_RECENT_DAYS) {
      active_8_14 += row.users;
    } else if (row.days <= ENGAGEMENT_LAPSING_DAYS) {
      active_15_30 += row.users;
    } else if (row.days <= ENGAGEMENT_INACTIVE_DAYS) {
      active_31_60 += row.users;
    } else {
      churned_60_plus += row.users;
    }
  }

  const total =
    active_0_7 + active_8_14 + active_15_30 + active_31_60 + churned_60_plus;

  return {
    summary: {
      total_identified_users: total,
      active_last_7_days: active_0_7,
      active_8_to_14_days: active_8_14,
      active_15_to_30_days: active_15_30,
      inactive_31_to_60_days: active_31_60,
      churned_60_plus_days: churned_60_plus,
    },
    distribution: raw,
  };
}

// ---------------------------------------------------------------------------
// Cohort retention matrix
//
// Definition: every user is assigned to exactly ONE cohort, the interval of
// their FIRST `firstEvent` within the window (first-touch). For each cohort we
// count how many of those users performed `secondEvent` 0..N intervals later.
//   - criteria 'on'           -> active exactly k intervals after  (=)
//   - criteria 'on_or_after'  -> active at least k intervals after  (>=, cumulative)
// When `firstEvent` / `secondEvent` is empty the name filter is dropped and the
// query measures retention on ANY activity (active-user retention).
// ---------------------------------------------------------------------------

const LUXON_UNIT: Record<IRetentionInterval, 'days' | 'weeks' | 'months'> = {
  minute: 'days',
  hour: 'days',
  day: 'days',
  week: 'weeks',
  month: 'months',
};

const CLICKHOUSE_DATE_TIME_LENGTH = 'yyyy-MM-dd HH:mm:ss'.length;
const ISO_DATE_LENGTH = 'yyyy-MM-dd'.length;

// Normalize an ISO or `yyyy-MM-dd HH:mm:ss` string into ClickHouse date-time form.
function utc(date: string) {
  return date.replace('T', ' ').slice(0, CLICKHOUSE_DATE_TIME_LENGTH);
}

// Number of `interval` buckets spanned by [startDate, endDate]; drives the
// number of retention columns (0..diffInterval).
function diffIntervalCount(
  startDate: string,
  endDate: string,
  interval: IRetentionInterval
) {
  const unit = LUXON_UNIT[interval];
  const start = DateTime.fromFormat(utc(startDate), 'yyyy-MM-dd HH:mm:ss', {
    zone: 'utc',
  });
  const end = DateTime.fromFormat(utc(endDate), 'yyyy-MM-dd HH:mm:ss', {
    zone: 'utc',
  });
  return Math.max(0, Math.floor(end.diff(start, unit).as(unit)));
}

export async function getRetentionCohort(
  deps: ServiceDeps,
  input: IGetRetentionCohortInput
) {
  const {
    projectId,
    firstEvent,
    secondEvent,
    criteria = 'on_or_after',
    interval = 'day',
    startDate,
    endDate,
    filters = [],
  } = input;

  const diffInterval = diffIntervalCount(startDate, endDate, interval);

  const cohortData = await runQuery<{
    cohort_interval: string;
    total_first_event_count: number;
    [key: string]: number | string;
  }>(
    deps,
    retentionCohortQuery({
      projectId,
      firstEvent,
      secondEvent,
      criteria,
      interval,
      start: utc(startDate),
      end: utc(endDate),
      diffInterval,
      filters,
    })
  );

  // Reference point for cohort maturity: we only have return data up to "now",
  // so periods that haven't elapsed yet are excluded from the weighted average.
  const until = DateTime.utc().toFormat('yyyy-MM-dd HH:mm:ss');
  return processCohortData(cohortData, diffInterval, interval, until);
}

// Number of fully-elapsed periods between a cohort's start and the reference
// date. Periods beyond this haven't happened yet, so they carry no return data
// and must be excluded from the average. Fails open (treats everything as
// mature) when dates are missing/unparseable.
function maturePeriodCount(
  cohortInterval: string,
  until: string | undefined,
  interval: IRetentionInterval
): number {
  if (!until) {
    return Number.POSITIVE_INFINITY;
  }
  const unit = LUXON_UNIT[interval];
  const cohort = DateTime.fromFormat(
    cohortInterval.slice(0, ISO_DATE_LENGTH),
    'yyyy-MM-dd',
    {
      zone: 'utc',
    }
  );
  const ref = DateTime.fromFormat(until, 'yyyy-MM-dd HH:mm:ss', {
    zone: 'utc',
  });
  if (!(cohort.isValid && ref.isValid)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.floor(ref.diff(cohort, unit).as(unit));
}

// Shapes the raw ClickHouse matrix into per-cohort rows + a leading weighted-
// average row.
//
// The average is a maturity-aware pooled rate: for each period column it pools
// only the cohorts old enough to have actually reached that period
// (cohort_interval + N intervals <= `until`). This keeps not-yet-elapsed cells
// from being read as churn AND keeps genuine zeros in, so the late curve is not
// inflated. Counts are normalised to the representative (mean) cohort size, so
// the row is internally consistent: period 0 equals Total profiles and the
// curve starts at 100%.
export function processCohortData(
  data: Array<{
    cohort_interval: string;
    total_first_event_count: number;
    [key: string]: number | string;
  }>,
  diffInterval: number,
  interval: IRetentionInterval = 'day',
  until?: string
): IRetentionCohortRow[] {
  if (data.length === 0) {
    return [];
  }

  const columns = range(0, diffInterval + 1);
  const processed = data.map((row) => {
    const sum = row.total_first_event_count;
    const values = columns.map(
      (index) => (row[`interval_${index}_user_count`] || 0) as number
    );

    return {
      cohort_interval: row.cohort_interval,
      sum,
      values,
      percentages: values.map((value) =>
        sum > 0 ? round(value / sum, RETENTION_PERCENTAGE_DECIMALS) : 0
      ),
    };
  });

  const maturePeriods = processed.map((row) =>
    maturePeriodCount(row.cohort_interval, until, interval)
  );
  const totalSize = processed.reduce((acc, row) => acc + row.sum, 0);
  const representativeSize = round(
    totalSize / processed.length,
    RETENTION_COUNT_DECIMALS
  );

  const averageRow: IRetentionCohortRow = {
    cohort_interval: 'Weighted Average',
    sum: representativeSize,
    values: [],
    percentages: [],
  };

  for (const index of columns) {
    let matureSize = 0;
    let retained = 0;
    processed.forEach((row, i) => {
      if (index <= (maturePeriods[i] as number)) {
        matureSize += row.sum;
        retained += row.values[index] as number;
      }
    });
    const rate = matureSize > 0 ? retained / matureSize : 0;
    averageRow.percentages.push(round(rate, RETENTION_PERCENTAGE_DECIMALS));
    averageRow.values.push(
      round(rate * representativeSize, RETENTION_COUNT_DECIMALS)
    );
  }

  return [averageRow, ...processed];
}

/** See funnel.service.ts's `createFunnelService` for why each chart
 * Sub-module carries its own factory. */
export function createRetentionService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    processCohortData,
    getRetentionCohort: (
      input: Parameters<typeof getRetentionCohort>[1]
    ): ReturnType<typeof getRetentionCohort> => getRetentionCohort(deps, input),
    getRetentionCohortCore: (
      projectId: string
    ): ReturnType<typeof getRetentionCohortCore> =>
      getRetentionCohortCore(deps, projectId),
    getRetentionSeries: (
      input: Parameters<typeof getRetentionSeries>[1]
    ): ReturnType<typeof getRetentionSeries> => getRetentionSeries(deps, input),
    getRetentionLastSeenSeries: (
      input: Parameters<typeof getRetentionLastSeenSeries>[1]
    ): ReturnType<typeof getRetentionLastSeenSeries> =>
      getRetentionLastSeenSeries(deps, input),
    getRollingActiveUsers: (
      input: Parameters<typeof getRollingActiveUsers>[1]
    ): ReturnType<typeof getRollingActiveUsers> =>
      getRollingActiveUsers(deps, input),
    getRollingActiveUsersCore: (
      input: Parameters<typeof getRollingActiveUsersCore>[1]
    ): ReturnType<typeof getRollingActiveUsersCore> =>
      getRollingActiveUsersCore(deps, input),
    getWeeklyRetentionSeriesCore: (
      input: IGetWeekRetentionInput
    ): ReturnType<typeof getWeeklyRetentionSeriesCore> =>
      getWeeklyRetentionSeriesCore(deps, input),
    getEngagementCore: (
      input: IGetWeekRetentionInput
    ): ReturnType<typeof getEngagementCore> => getEngagementCore(deps, input),
  };
}
