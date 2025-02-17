import { escape } from 'sqlstring';

import { TABLE_NAMES, chQuery } from '../clickhouse/client';

type IGetWeekRetentionInput = {
  projectId: string;
};

// https://www.geeksforgeeks.org/how-to-calculate-retention-rate-in-sql/
export function getRetentionCohortTable({ projectId }: IGetWeekRetentionInput) {
  const sql = `
WITH 
  m AS
  (
      SELECT
          profile_id,
          max(toWeek(created_at)) AS last_seen
      FROM ${TABLE_NAMES.events}
      WHERE (project_id = ${escape(projectId)}) AND (profile_id != device_id)
      GROUP BY profile_id
  ),
  n AS
  (
      SELECT
          profile_id,
          min(toWeek(created_at)) AS first_seen
      FROM ${TABLE_NAMES.events}
      WHERE (project_id = ${escape(projectId)}) AND (profile_id != device_id)
      GROUP BY profile_id
  ),
  a AS
  (
      SELECT
          m.profile_id,
          m.last_seen,
          n.first_seen,
          m.last_seen - n.first_seen AS diff
      FROM m, n
      WHERE m.profile_id = n.profile_id
  )
SELECT
  first_seen,
  SUM(multiIf(diff = 0, 1, 0)) AS period_0,
  SUM(multiIf(diff = 1, 1, 0)) AS period_1,
  SUM(multiIf(diff = 2, 1, 0)) AS period_2,
  SUM(multiIf(diff = 3, 1, 0)) AS period_3,
  SUM(multiIf(diff = 4, 1, 0)) AS period_4,
  SUM(multiIf(diff = 5, 1, 0)) AS period_5,
  SUM(multiIf(diff = 6, 1, 0)) AS period_6,
  SUM(multiIf(diff = 7, 1, 0)) AS period_7,
  SUM(multiIf(diff = 8, 1, 0)) AS period_8,
  SUM(multiIf(diff = 9, 1, 0)) AS period_9
FROM a
GROUP BY first_seen
ORDER BY first_seen ASC
  `;

  return chQuery<{
    first_seen: number;
    period_0: number;
    period_1: number;
    period_2: number;
    period_3: number;
    period_4: number;
    period_5: number;
    period_6: number;
    period_7: number;
    period_8: number;
    period_9: number;
  }>(sql);
}

// Retention graph
// https://www.sisense.com/blog/how-to-calculate-cohort-retention-in-sql/
export function getRetentionSeries({ projectId }: IGetWeekRetentionInput) {
  const sql = `
    SELECT
      toStartOfWeek(events.created_at) AS date,
      countDistinct(events.profile_id) AS active_users,
      countDistinct(future_events.profile_id) AS retained_users,
      (100 * (countDistinct(future_events.profile_id) / CAST(countDistinct(events.profile_id), 'float'))) AS retention
    FROM ${TABLE_NAMES.events} as events
    LEFT JOIN ${TABLE_NAMES.events} AS future_events ON 
      events.profile_id = future_events.profile_id
      AND toStartOfWeek(events.created_at) = toStartOfWeek(future_events.created_at - toIntervalWeek(1))
      AND future_events.profile_id != future_events.device_id
    WHERE 
      project_id = ${escape(projectId)} 
      AND events.profile_id != events.device_id
    GROUP BY 1
    ORDER BY date ASC`;

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
          WHERE project_id = ${escape(projectId)}
      )
      ARRAY JOIN range(${days}) AS n
    )
    WHERE project_id = ${escape(projectId)}
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
        WHERE (project_id = ${escape(projectId)}) AND (device_id != profile_id)
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
