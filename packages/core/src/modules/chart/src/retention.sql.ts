// Every ClickHouse query the retention service runs, as pure `sql` fragments
// (ADR-013). Converted 1:1 from packages/db/src/services/retention.service.ts
// (M7-004): the SQL text is V1's, with project id, event names, dates, the
// interval unit and the column count bound as `{pN:Type}` parameters instead
// of `sqlstring`-escaped literals. Result-set proofs against the local
// prod-copy are in retention.sql.proof.md.
//
// The filter compiler still renders text (see compiled.ts); its output is the
// only thing spliced into the cohort statement.
//
// Cluster note (docs/ENVIRONMENT.md): `events`, `dau_mv` and `cohort_events_mv`
// are Distributed on Cloud. None of these statements contains an
// `IN (subquery)` — the cohort matrix is a CTE self-join, exactly V1's shape —
// so no `IN` / `GLOBAL IN` decision is made or unmade here.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IChartEventFilter } from '@openpanel/validation';
import { compiledText } from './compiled';
import { CHART_TABLE } from './field-resolution';
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

/** Week-over-week active-user retention, one row per week. */
export function retentionSeriesQuery(projectId: string): SqlFragment {
  return sql`
    WITH weekly_active AS (
      SELECT
        profile_id,
        toStartOfWeek(created_at) AS week
      FROM ${sql.id(CHART_TABLE.events)}
      WHERE project_id = ${sql.string(projectId)}
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
    WHERE project_id = ${sql.string(projectId)}
    GROUP BY date`;
}

/** Days-since-last-seen distribution over identified profiles. */
export function retentionLastSeenSeriesQuery(projectId: string): SqlFragment {
  return sql`
    WITH last_active AS (
        SELECT
            max(created_at) AS last_active,
            profile_id
        FROM ${sql.id(CHART_TABLE.events)}
        WHERE (project_id = ${sql.string(projectId)}) AND (device_id != profile_id)
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

/** V1's `name = …` / `name IN (…)`; `sql.empty` means "any event". */
function eventNameWhere(events: string[] | undefined): SqlFragment {
  if (!events || events.length === 0) {
    return sql.empty;
  }
  if (events.length === 1) {
    return sql`AND name = ${sql.string(events[0] as string)}`;
  }
  return sql`AND name IN ${sql.array('String', events)}`;
}

/**
 * The cohort retention matrix (V1 `getRetentionCohort`'s five-CTE query).
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
  const source = sql.id(
    needRawEvents ? CHART_TABLE.events : CHART_TABLE.cohortEventsMv
  );

  const baseConditions: SqlFragment[] = [
    sql`project_id = ${sql.string(projectId)}`,
  ];
  if (needRawEvents) {
    // cohort_events_mv only stores identified-user rows; replicate that here.
    baseConditions.push(sql`profile_id != device_id`);
  }
  if (filters.length > 0) {
    baseConditions.push(
      ...Object.values(getEventFiltersWhereClause(filters, projectId)).map(
        compiledText
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
