import sqlstring from 'sqlstring';
import type { IChartEventFilter } from '@openpanel/validation';

import { chQuery, TABLE_NAMES } from '../clickhouse/client';
import { getEventFiltersWhereClause } from './chart.service';

export type IFlowConfig = {
  type: 'flow';
  triggerEvent: string;
  triggerFilters?: IChartEventFilter[];
  delayMinutes: number;
  exitEvent?: string;
};

export function buildFlowMatchQuery({
  projectId,
  config,
  windowStartMinutesAgo,
  windowEndMinutesAgo,
  countOnly,
}: {
  projectId: string;
  config: IFlowConfig;
  windowStartMinutesAgo: number;
  windowEndMinutesAgo: number;
  countOnly?: boolean;
}): string {
  const triggerFilters = config.triggerFilters ?? [];
  const filterClauses = Object.values(
    getEventFiltersWhereClause(triggerFilters, projectId),
  );
  const filterClause =
    filterClauses.length > 0 ? ` AND ${filterClauses.join(' AND ')}` : '';

  // Exit event: LEFT JOIN against users who did the exit event in the window,
  // then exclude those whose first exit came AFTER their trigger event.
  // ClickHouse doesn't support correlated NOT EXISTS, so we use LEFT JOIN pattern.
  const joinClause = config.exitEvent
    ? `LEFT JOIN (
         SELECT profile_id, min(created_at) AS first_exit_at
         FROM ${TABLE_NAMES.events}
         WHERE project_id = ${sqlstring.escape(projectId)}
           AND name = ${sqlstring.escape(config.exitEvent)}
           AND created_at >= (now() - INTERVAL ${windowStartMinutesAgo} MINUTE)
         GROUP BY profile_id
       ) ex ON ex.profile_id = e.profile_id`
    : '';

  const exitClause = config.exitEvent
    ? ' AND (ex.first_exit_at IS NULL OR ex.first_exit_at <= e.created_at)'
    : '';

  const select = countOnly
    ? 'count(DISTINCT e.profile_id) AS count'
    : 'DISTINCT e.profile_id AS profile_id';

  return `
    SELECT ${select}
    FROM ${TABLE_NAMES.events} e
    ${joinClause}
    WHERE e.project_id = ${sqlstring.escape(projectId)}
      AND e.name = ${sqlstring.escape(config.triggerEvent)}
      AND e.created_at BETWEEN
        (now() - INTERVAL ${windowStartMinutesAgo} MINUTE)
        AND (now() - INTERVAL ${windowEndMinutesAgo} MINUTE)
      AND e.profile_id != ''
      AND e.profile_id != e.device_id${filterClause}${exitClause}
  `;
}

/**
 * Count matching users for a flow rule without firing.
 * Used by the UI preview — shows "Would fire for N users" on the current 5-min window.
 */
export async function countFlowRuleMatches({
  projectId,
  config,
  cronIntervalMinutes = 5,
}: {
  projectId: string;
  config: IFlowConfig;
  cronIntervalMinutes?: number;
}): Promise<number> {
  const delay = config.delayMinutes ?? 0;
  const query = buildFlowMatchQuery({
    projectId,
    config,
    windowStartMinutesAgo: delay + cronIntervalMinutes,
    windowEndMinutesAgo: delay,
    countOnly: true,
  });
  const rows = await chQuery<{ count: number }>(query);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Run the flow match query and return matched profile IDs.
 * Used by the Hermes cron job.
 */
export async function queryFlowRuleMatches({
  projectId,
  config,
  cronIntervalMinutes = 5,
}: {
  projectId: string;
  config: IFlowConfig;
  cronIntervalMinutes?: number;
}): Promise<string[]> {
  const delay = config.delayMinutes ?? 0;
  const query = buildFlowMatchQuery({
    projectId,
    config,
    windowStartMinutesAgo: delay + cronIntervalMinutes,
    windowEndMinutesAgo: delay,
  });
  const rows = await chQuery<{ profile_id: string }>(query);
  return rows.map((r) => r.profile_id).filter(Boolean);
}
