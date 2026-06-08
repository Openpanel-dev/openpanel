import { DateTime, round } from '@openpanel/common';
import type { IChartEventFilter } from '@openpanel/validation';
import { range } from 'ramda';
import sqlstring from 'sqlstring';

import { TABLE_NAMES, chQuery } from '../clickhouse/client';
import { getEventFiltersWhereClause } from './chart.service';

type IGetWeekRetentionInput = {
  projectId: string;
};

// Week-over-week retention graph: for each week, how many active users were
// also active the following week.
//
// Instead of self-joining the raw events table (O(events²) per profile), we
// first collapse events to one row per (profile, week) in `weekly_active`,
// then self-join that much smaller set to its next week. Same result, a
// fraction of the work on high-volume projects.
export function getRetentionSeries({ projectId }: IGetWeekRetentionInput) {
  const sql = `
    WITH weekly_active AS (
      SELECT
        profile_id,
        toStartOfWeek(created_at) AS week
      FROM ${TABLE_NAMES.events}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND profile_id != device_id
      GROUP BY profile_id, week
    )
    SELECT
      cur.week AS date,
      countDistinct(cur.profile_id) AS active_users,
      countDistinct(nxt.profile_id) AS retained_users,
      (100 * (countDistinct(nxt.profile_id) / CAST(countDistinct(cur.profile_id), 'Float64'))) AS retention
    FROM weekly_active AS cur
    LEFT JOIN weekly_active AS nxt
      ON cur.profile_id = nxt.profile_id
      AND nxt.week = cur.week + toIntervalWeek(1)
    GROUP BY date
    ORDER BY date ASC
    -- Unmatched LEFT JOIN rows must be NULL (not the empty-string default),
    -- otherwise countDistinct(nxt.profile_id) counts '' as a retained user.
    SETTINGS join_use_nulls = 1`;

  return chQuery<{
    date: string;
    active_users: number;
    retained_users: number;
    retention: number;
  }>(sql);
}

// https://medium.com/@andre_bodro/how-to-fast-calculating-mau-in-clickhouse-fd793559b229
// Rolling active users
export type IServiceRetentionRollingActiveUsers = {
  date: string;
  users: number;
};
export function getRollingActiveUsers({
  projectId,
  days,
}: IGetWeekRetentionInput & { days: number }) {
  const sql = `
    SELECT
      date,
      uniqMerge(profile_id) AS users
    FROM
    (
      SELECT
          date + n AS date,
          profile_id,
          project_id
      FROM
      (
          SELECT *
          FROM ${TABLE_NAMES.dau_mv}
          WHERE project_id = ${sqlstring.escape(projectId)}
      )
      ARRAY JOIN range(${days}) AS n
    )
    WHERE project_id = ${sqlstring.escape(projectId)}
    GROUP BY date`;

  return chQuery<IServiceRetentionRollingActiveUsers>(sql);
}

export function getRetentionLastSeenSeries({
  projectId,
}: IGetWeekRetentionInput) {
  const sql = `
    WITH last_active AS (
        SELECT
            max(created_at) AS last_active,
            profile_id
        FROM ${TABLE_NAMES.events}
        WHERE (project_id = ${sqlstring.escape(projectId)}) AND (device_id != profile_id)
        GROUP BY profile_id
    )
    SELECT
      dateDiff('day', last_active, today()) AS days,
      countDistinct(profile_id) AS users
    FROM last_active
    GROUP BY days
    ORDER BY days ASC`;

  return chQuery<{
    days: number;
    users: number;
  }>(sql);
}

export async function getRollingActiveUsersCore(input: {
  projectId: string;
  days: number;
}) {
  const data = await getRollingActiveUsers(input);
  return {
    window_days: input.days,
    label:
      input.days === 1
        ? 'DAU'
        : input.days === 7
          ? 'WAU'
          : input.days === 30
            ? 'MAU'
            : `${input.days}d active`,
    series: data,
  };
}

export async function getWeeklyRetentionSeriesCore(projectId: string) {
  return getRetentionSeries({ projectId });
}

// Weekly active-user retention cohort over the last 12 weeks, computed by the
// unified getRetentionCohort engine (replaces the legacy, broken
// getRetentionCohortTable). firstEvent/secondEvent are omitted so any
// identified activity counts toward the cohort.
export async function getRetentionCohortCore(projectId: string) {
  const end = DateTime.now();
  const start = end.minus({ weeks: 12 });
  return getRetentionCohort({
    projectId,
    interval: 'week',
    startDate: start.toFormat('yyyy-MM-dd HH:mm:ss'),
    endDate: end.toFormat('yyyy-MM-dd HH:mm:ss'),
  });
}

export async function getEngagementCore(projectId: string) {
  const raw = await getRetentionLastSeenSeries({ projectId });

  let active_0_7 = 0;
  let active_8_14 = 0;
  let active_15_30 = 0;
  let active_31_60 = 0;
  let churned_60_plus = 0;

  for (const row of raw) {
    if (row.days <= 7) active_0_7 += row.users;
    else if (row.days <= 14) active_8_14 += row.users;
    else if (row.days <= 30) active_15_30 += row.users;
    else if (row.days <= 60) active_31_60 += row.users;
    else churned_60_plus += row.users;
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
// This is the single source of truth for retention cohorts. It powers the
// dashboard retention chart (via the tRPC `cohort` procedure) as well as the
// MCP / agent / REST retention endpoints.
//
// Definition: every user is assigned to exactly ONE cohort, the interval of
// their FIRST `firstEvent` within the window (first-touch). For each cohort we
// count how many of those users performed `secondEvent` 0..N intervals later.
//   - criteria 'on'           -> active exactly k intervals after  (=)
//   - criteria 'on_or_after'  -> active at least k intervals after  (>=, cumulative)
// When `firstEvent` / `secondEvent` is empty the name filter is dropped and the
// query measures retention on ANY activity (active-user retention).
// ---------------------------------------------------------------------------

export type IRetentionInterval = 'minute' | 'hour' | 'day' | 'week' | 'month';
export type IRetentionCriteria = 'on' | 'on_or_after';

export type IGetRetentionCohortInput = {
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
};

export type IRetentionCohortRow = {
  cohort_interval: string;
  sum: number;
  values: number[];
  percentages: number[];
};

const SQL_START_OF: Record<IRetentionInterval, string> = {
  minute: 'toDate',
  hour: 'toDate',
  day: 'toDate',
  week: 'toStartOfWeek',
  month: 'toStartOfMonth',
};

const SQL_INTERVAL: Record<IRetentionInterval, string> = {
  minute: 'DAY',
  hour: 'DAY',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
};

const LUXON_UNIT: Record<IRetentionInterval, 'days' | 'weeks' | 'months'> = {
  minute: 'days',
  hour: 'days',
  day: 'days',
  week: 'weeks',
  month: 'months',
};

// Normalize an ISO or `yyyy-MM-dd HH:mm:ss` string into ClickHouse date-time form.
function utc(date: string) {
  return date.replace('T', ' ').slice(0, 19);
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

// Build the `name = ... / name IN (...)` predicate; null means "any event".
function eventNameWhere(events: string[] | undefined): string | null {
  if (!events || events.length === 0) {
    return null;
  }
  if (events.length === 1) {
    return `name = ${sqlstring.escape(events[0])}`;
  }
  return `name IN (${events.map((event) => sqlstring.escape(event)).join(', ')})`;
}

export async function getRetentionCohort(input: IGetRetentionCohortInput) {
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
  const sqlInterval = SQL_INTERVAL[interval];
  const sqlToStartOf = SQL_START_OF[interval];
  const countCriteria: '>=' | '=' = criteria === 'on_or_after' ? '>=' : '=';

  const start = utc(startDate);
  const end = utc(endDate);
  const escProject = sqlstring.escape(projectId);
  const firstWhere = eventNameWhere(firstEvent);
  const secondWhere = eventNameWhere(secondEvent);

  // Hybrid source: cohort_events_mv (skinny, fast) carries only
  // project_id/name/created_at/profile_id, so any filter referencing event
  // properties or columns forces a fallback to the raw events table. Cohort
  // membership filters only need profile_id, so they stay on the fast path.
  const needRawEvents = filters.some(
    (filter) =>
      filter.operator !== 'inCohort' && filter.operator !== 'notInCohort'
  );
  const source = needRawEvents ? TABLE_NAMES.events : TABLE_NAMES.cohort_events_mv;

  const baseConditions = [`project_id = ${escProject}`];
  if (needRawEvents) {
    // cohort_events_mv only stores identified-user rows; replicate that here.
    baseConditions.push('profile_id != device_id');
  }
  if (filters.length > 0) {
    baseConditions.push(
      ...Object.values(getEventFiltersWhereClause(filters, projectId))
    );
  }
  const baseWhere = baseConditions.join('\n        AND ');

  const columns = range(0, diffInterval + 1);
  const usersSelect = columns
    .map(
      (index) =>
        `groupUniqArrayIf(profile_id, x_after_cohort ${countCriteria} ${index}) AS interval_${index}_users`
    )
    .join(',\n          ');
  const countsSelect = columns
    .map(
      (index) =>
        `length(interval_${index}_users) AS interval_${index}_user_count`
    )
    .join(',\n          ');

  const cohortQuery = `
    WITH
    cohort_users AS (
      SELECT
        profile_id AS userID,
        ${sqlToStartOf}(min(created_at)) AS cohort_interval
      FROM ${source}
      WHERE ${baseWhere}
        ${firstWhere ? `AND ${firstWhere}` : ''}
        AND created_at >= toDateTime('${start}')
        AND created_at <= toDateTime('${end}')
      GROUP BY profile_id
    ),
    last_event AS (
      SELECT
        profile_id,
        toDate(created_at) AS event_date
      FROM ${source}
      WHERE ${baseWhere}
        ${secondWhere ? `AND ${secondWhere}` : ''}
        AND created_at >= toDateTime('${start}')
        AND created_at <= toDateTime('${end}') + INTERVAL ${diffInterval} ${sqlInterval}
    ),
    retention_matrix AS (
      SELECT
        f.cohort_interval,
        l.profile_id,
        dateDiff('${sqlInterval}', f.cohort_interval, ${sqlToStartOf}(l.event_date)) AS x_after_cohort
      FROM cohort_users AS f
      INNER JOIN last_event AS l ON f.userID = l.profile_id
      WHERE l.event_date >= f.cohort_interval
        AND dateDiff('${sqlInterval}', f.cohort_interval, ${sqlToStartOf}(l.event_date)) <= ${diffInterval}
    ),
    interval_users AS (
      SELECT
        cohort_interval,
        ${usersSelect}
      FROM retention_matrix
      GROUP BY cohort_interval
    ),
    cohort_sizes AS (
      SELECT
        cohort_interval,
        COUNT(DISTINCT userID) AS total_first_event_count
      FROM cohort_users
      GROUP BY cohort_interval
    )
    SELECT
      interval_users.cohort_interval AS cohort_interval,
      cs.total_first_event_count AS total_first_event_count,
      ${countsSelect}
    FROM interval_users
    LEFT JOIN cohort_sizes AS cs ON interval_users.cohort_interval = cs.cohort_interval
    ORDER BY cohort_interval ASC
  `;

  const cohortData = await chQuery<{
    cohort_interval: string;
    total_first_event_count: number;
    [key: string]: number | string;
  }>(cohortQuery);

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
  const cohort = DateTime.fromFormat(cohortInterval.slice(0, 10), 'yyyy-MM-dd', {
    zone: 'utc',
  });
  const ref = DateTime.fromFormat(until, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });
  if (!cohort.isValid || !ref.isValid) {
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
      percentages: values.map((value) => (sum > 0 ? round(value / sum, 2) : 0)),
    };
  });

  const maturePeriods = processed.map((row) =>
    maturePeriodCount(row.cohort_interval, until, interval)
  );
  const totalSize = processed.reduce((acc, row) => acc + row.sum, 0);
  const representativeSize = round(totalSize / processed.length, 0);

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
      if (index <= maturePeriods[i]!) {
        matureSize += row.sum;
        retained += row.values[index]!;
      }
    });
    const rate = matureSize > 0 ? retained / matureSize : 0;
    averageRow.percentages.push(round(rate, 2));
    averageRow.values.push(round(rate * representativeSize, 0));
  }

  return [averageRow, ...processed];
}
