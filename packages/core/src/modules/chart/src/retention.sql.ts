// Every ClickHouse query the retention service runs, as pure `sql` fragments.
//
// Cluster note: `events`, `dau_mv` and `cohort_events_mv` are Distributed on
// Cloud. None of these statements contains an `IN (subquery)` — the cohort
// matrix is a CTE self-join — so no `IN` / `GLOBAL IN` decision arises.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IChartEventFilter } from '../../report/report.constants';
import { compiledText } from './compiled';
import { formatClickhouseDate } from './dates';
import { buildGroupsQuery, CHART_TABLE } from './field-resolution';
import { getEventFiltersWhereClause } from './filter-where';

export type IRetentionInterval = 'minute' | 'hour' | 'day' | 'week' | 'month';
export type IRetentionCriteria = 'on' | 'on_or_after';

/** ClickHouse `toStartOf*` function per interval — a closed set, never input. */
export const SQL_START_OF: Record<IRetentionInterval, string> = {
  minute: 'toDate',
  hour: 'toDate',
  day: 'toDate',
  week: 'toStartOfWeek',
  month: 'toStartOfMonth',
};

/** `dateDiff` unit / `INTERVAL n <unit>` per interval — also a closed set. */
export const SQL_INTERVAL: Record<IRetentionInterval, string> = {
  minute: 'DAY',
  hour: 'DAY',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
};

const COUNT_CRITERIA: Record<IRetentionCriteria, string> = {
  on_or_after: '>=',
  on: '=',
};

/**
 * Without both dates the statement reads the project's whole lifetime: the
 * MCP tools pass none and their contracts rely on it.
 */
export interface RetentionSeriesQueryInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
}

function createdAtWithin({
  startDate,
  endDate,
}: RetentionSeriesQueryInput): SqlFragment {
  if (!(startDate && endDate)) {
    return sql.empty;
  }
  return sql`AND created_at BETWEEN toDateTime(${sql.string(formatClickhouseDate(startDate))}) AND toDateTime(${sql.string(formatClickhouseDate(endDate))})`;
}

/**
 * Week-over-week active-user retention, one row per week, within the window
 * when one is given; a week whose following week falls outside it reports
 * zero retained users.
 */
export function retentionSeriesQuery(
  input: RetentionSeriesQueryInput
): SqlFragment {
  const { projectId } = input;
  return sql`
    WITH weekly_active AS (
      SELECT
        profile_id,
        toStartOfWeek(created_at) AS week
      FROM ${sql.id(CHART_TABLE.events)}
      WHERE project_id = ${sql.string(projectId)}
        AND profile_id != device_id
        ${createdAtWithin(input)}
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
}

/** Rolling N-day unique actives off the daily-active materialized view. */
export function rollingActiveUsersQuery(
  projectId: string,
  days: number
): SqlFragment {
  return sql`
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
          FROM ${sql.id(CHART_TABLE.dauMv)}
          WHERE project_id = ${sql.string(projectId)}
      )
      ARRAY JOIN range(${sql.uint64(days)}) AS n
    )
    -- date + n smears each active day forward, so without this the series
    -- runs up to days-1 days past today.
    WHERE project_id = ${sql.string(projectId)} AND date <= today()
    GROUP BY date`;
}

/**
 * Days-since-last-seen distribution over identified profiles; with a window,
 * a profile last seen before it is no longer counted.
 */
export function retentionLastSeenSeriesQuery(
  input: RetentionSeriesQueryInput
): SqlFragment {
  const { projectId } = input;
  return sql`
    WITH last_active AS (
        SELECT
            max(created_at) AS last_active,
            profile_id
        FROM ${sql.id(CHART_TABLE.events)}
        WHERE (project_id = ${sql.string(projectId)}) AND (device_id != profile_id)
          ${createdAtWithin(input)}
        GROUP BY profile_id
    )
    SELECT
      dateDiff('day', last_active, today()) AS days,
      countDistinct(profile_id) AS users
    FROM last_active
    GROUP BY days
    ORDER BY days ASC`;
}

export interface RetentionCohortQueryInput {
  projectId: string;
  firstEvent?: string[];
  secondEvent?: string[];
  criteria: IRetentionCriteria;
  interval: IRetentionInterval;
  /** Already normalised to `yyyy-MM-dd HH:mm:ss`. */
  start: string;
  end: string;
  /** Number of retention columns beyond the cohort's own interval. */
  diffInterval: number;
  filters: IChartEventFilter[];
}

/** Qualifies the events columns that the groups join's `_g` also has (`name`, `properties`). */
const EVENTS_ALIAS = 'e';

/** `name = …` / `name IN (…)`; `sql.empty` means "any event". */
function eventNameWhere(events: string[] | undefined): SqlFragment {
  if (!events || events.length === 0) {
    return sql.empty;
  }
  if (events.length === 1) {
    return sql`AND e.name = ${sql.string(events[0] as string)}`;
  }
  return sql`AND e.name IN ${sql.array('String', events)}`;
}

/**
 * The cohort retention matrix: a five-CTE query.
 *
 * Source table is a closed two-way choice, not a caller input: cohort
 * membership filters stay on the skinny `cohort_events_mv`, anything reading a
 * property or column falls back to raw `events`.
 */
export function retentionCohortQuery(
  input: RetentionCohortQueryInput
): SqlFragment {
  const {
    projectId,
    firstEvent,
    secondEvent,
    criteria,
    interval,
    start,
    end,
    diffInterval,
    filters,
  } = input;

  const sqlInterval = SQL_INTERVAL[interval];
  const toStartOf = compiledText(SQL_START_OF[interval]);
  const intervalUnit = compiledText(sqlInterval);
  const countCriteria = compiledText(COUNT_CRITERIA[criteria]);

  const needRawEvents = filters.some(
    (filter) =>
      filter.operator !== 'inCohort' && filter.operator !== 'notInCohort'
  );
  const needsGroupJoin = filters.some((filter) =>
    filter.name.startsWith('group.')
  );
  const groupJoin = needsGroupJoin
    ? sql`ARRAY JOIN groups AS _group_id LEFT ANY JOIN (${buildGroupsQuery(projectId)}) AS _g ON _g.id = _group_id`
    : sql.empty;
  const source = sql`${sql.id(
    needRawEvents ? CHART_TABLE.events : CHART_TABLE.cohortEventsMv
  )} AS ${compiledText(EVENTS_ALIAS)} ${groupJoin}`;

  const baseConditions: SqlFragment[] = [
    sql`project_id = ${sql.string(projectId)}`,
  ];
  if (needRawEvents) {
    // cohort_events_mv only stores identified-user rows; replicate that here.
    baseConditions.push(sql`profile_id != device_id`);
  }
  if (filters.length > 0) {
    baseConditions.push(
      ...Object.values(
        getEventFiltersWhereClause(
          filters,
          projectId,
          needsGroupJoin ? EVENTS_ALIAS : undefined
        )
      )
    );
  }
  const baseWhere = sql.join(baseConditions, ' AND ');

  const columns = Array.from({ length: diffInterval + 1 }, (_, i) => i);
  const usersSelect = sql.join(
    columns.map(
      (index) =>
        sql`groupUniqArrayIf(profile_id, x_after_cohort ${countCriteria} ${sql.uint64(index)}) AS interval_${compiledText(String(index))}_users`
    )
  );
  const countsSelect = sql.join(
    columns.map(
      (index) =>
        sql`length(interval_${compiledText(String(index))}_users) AS interval_${compiledText(String(index))}_user_count`
    )
  );

  return sql`
    WITH
    cohort_users AS (
      SELECT
        profile_id AS userID,
        ${toStartOf}(min(created_at)) AS cohort_interval
      FROM ${source}
      WHERE ${baseWhere}
        ${eventNameWhere(firstEvent)}
        AND created_at >= toDateTime(${sql.string(start)})
        AND created_at <= toDateTime(${sql.string(end)})
      GROUP BY profile_id
    ),
    last_event AS (
      SELECT
        profile_id,
        toDate(created_at) AS event_date
      FROM ${source}
      WHERE ${baseWhere}
        ${eventNameWhere(secondEvent)}
        AND created_at >= toDateTime(${sql.string(start)})
        AND created_at <= toDateTime(${sql.string(end)}) + INTERVAL ${sql.uint64(diffInterval)} ${intervalUnit}
    ),
    retention_matrix AS (
      SELECT
        f.cohort_interval,
        l.profile_id,
        dateDiff(${sql.string(sqlInterval)}, f.cohort_interval, ${toStartOf}(l.event_date)) AS x_after_cohort
      FROM cohort_users AS f
      INNER JOIN last_event AS l ON f.userID = l.profile_id
      WHERE l.event_date >= f.cohort_interval
        AND dateDiff(${sql.string(sqlInterval)}, f.cohort_interval, ${toStartOf}(l.event_date)) <= ${sql.uint64(diffInterval)}
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
}
