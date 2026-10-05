// The filter-value dropdown for a top-level event column (country, os, city,
// device…) has no MV. Scanning `events` for it was a full multi-billion-row
// read on high-volume projects that hit max_execution_time and returned
// nothing. Session-level columns (geo/device/referrer, denormalised onto every
// event) come from the far smaller `sessions` table instead — same distinct
// set, one row per session. `path`/`origin` are per-pageview and stay on
// `events`; so does a specific-event query, since `sessions` has no `name`.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { CHART_TABLE } from './field-resolution';
import { PROPERTY_VALUES_LIMIT } from './sql';

export const SESSION_LEVEL_VALUE_COLUMNS: ReadonlySet<string> = new Set([
  'country',
  'region',
  'city',
  'os',
  'os_version',
  'browser',
  'browser_version',
  'device',
  'brand',
  'model',
  'referrer',
  'referrer_name',
  'referrer_type',
]);

/**
 * A value picker only needs recently-seen values, so the `events` fallback is
 * clamped to this window.
 */
export const EVENT_FIELD_VALUES_LOOKBACK_DAYS = 30;

export function readsEventFieldValuesFromSessions(
  event: string,
  column: string
): boolean {
  return event === '*' && SESSION_LEVEL_VALUE_COLUMNS.has(column);
}

export function eventFieldValuesQuery(input: {
  projectId: string;
  column: string;
  selectExpression: SqlFragment;
  event: string;
  lookbackDays?: number;
}): SqlFragment {
  const { projectId, column, selectExpression, event } = input;
  const lookbackDays = input.lookbackDays ?? EVENT_FIELD_VALUES_LOOKBACK_DAYS;
  const fromSessions = readsEventFieldValuesFromSessions(event, column);
  const table = fromSessions ? CHART_TABLE.sessions : CHART_TABLE.events;
  // Only `*` skips the name clause — an empty event name still filters on ''.
  const eventName =
    fromSessions || event === '*'
      ? sql.empty
      : sql` AND name = ${sql.string(event)}`;
  return sql`SELECT distinct ${selectExpression} as values FROM ${sql.id(table)} WHERE project_id = ${sql.string(projectId)} AND created_at > (now() - toIntervalDay(${sql.param('UInt32', lookbackDays)}))${eventName} ORDER BY created_at DESC LIMIT ${sql.uint64(PROPERTY_VALUES_LIMIT)}`;
}
