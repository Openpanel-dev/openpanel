// Every ClickHouse query the AI pages run, as `sql` fragments over `ai_events`.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import { toRangeBoundaryLiteral } from '../../../shared/ch-dates';
import { TABLE_NAMES } from '../../../shared/ch-tables';
import type { IInterval } from '../../report/report.constants';
import type { AiBreakdownDimension, IAiFilters } from '../ai.constants';

export const AI_EVENTS_TABLE = TABLE_NAMES.ai_events;

/** The columns a list or detail row selects. */
export const AI_EVENT_COLUMNS = sql`
  project_id, id, type, trace_id, span_id, parent_id, conversation_id, name,
  model, provider, input_tokens, output_tokens, cache_read_tokens,
  cache_write_tokens, reasoning_tokens, input_cost, output_cost, total_cost,
  cost_source, latency_ms, time_to_first_token_ms, is_error, http_status,
  stop_reason, is_stream, model_parameters, input, output, tools, error,
  profile_id, device_id, session_id, groups, properties, created_at
`;

export interface AiDateRange {
  startDate: string;
  endDate: string;
}

export function toStartOf(column: string, interval: IInterval): SqlFragment {
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(${sql.id(column)})`;
    case 'hour':
      return sql`toStartOfHour(${sql.id(column)})`;
    case 'day':
      return sql`toStartOfDay(${sql.id(column)})`;
    case 'week':
      return sql`toStartOfWeek(toDateTime(${sql.id(column)}))`;
    case 'month':
      return sql`toStartOfMonth(toDateTime(${sql.id(column)}))`;
    default:
      throw new Error(`Unsupported interval: ${String(interval)}`);
  }
}

function toStartOfExpr(expr: SqlFragment, interval: IInterval): SqlFragment {
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(${expr})`;
    case 'hour':
      return sql`toStartOfHour(${expr})`;
    case 'day':
      return sql`toStartOfDay(${expr})`;
    case 'week':
      return sql`toStartOfWeek(${expr})`;
    case 'month':
      return sql`toStartOfMonth(${expr})`;
    default:
      throw new Error(`Unsupported interval: ${String(interval)}`);
  }
}

const INTERVAL_STEP: Record<IInterval, SqlFragment> = {
  minute: sql`INTERVAL 1 MINUTE`,
  hour: sql`INTERVAL 1 HOUR`,
  day: sql`INTERVAL 1 DAY`,
  week: sql`INTERVAL 1 WEEK`,
  month: sql`INTERVAL 1 MONTH`,
};

/** Zero-fills every bucket of the range; `TO` is exclusive, hence the extra step. */
function fillClause(range: AiDateRange, interval: IInterval): SqlFragment {
  const from = toStartOfExpr(
    sql`toDateTime(${sql.string(toRangeBoundaryLiteral(range.startDate, 'start'))})`,
    interval
  );
  const to = toStartOfExpr(
    sql`toDateTime(${sql.string(toRangeBoundaryLiteral(range.endDate, 'end'))}) + ${INTERVAL_STEP[interval]}`,
    interval
  );
  return sql`WITH FILL FROM ${from} TO ${to} STEP ${INTERVAL_STEP[interval]}`;
}

function dateRangeWhere(range: AiDateRange): SqlFragment {
  return sql`created_at BETWEEN toDateTime64(${sql.string(toRangeBoundaryLiteral(range.startDate, 'start'))}, 3) AND toDateTime64(${sql.string(toRangeBoundaryLiteral(range.endDate, 'end'))}, 3)`;
}

function stringFilter(
  column: string,
  values: string[] | undefined
): SqlFragment {
  if (!values || values.length === 0) {
    return sql.empty;
  }
  return sql`AND ${sql.id(column)} IN ${sql.array('String', values)}`;
}

/** The filters every AI query shares, after `project_id` and the date range. */
export function filtersWhere(filters: IAiFilters | undefined): SqlFragment {
  if (!filters) {
    return sql.empty;
  }
  const errorClause =
    filters.isError === undefined
      ? sql.empty
      : sql`AND is_error = ${sql.bool(filters.isError)}`;
  const searchClause = filters.search
    ? sql`AND (positionCaseInsensitive(input, ${sql.string(filters.search)}) > 0 OR positionCaseInsensitive(output, ${sql.string(filters.search)}) > 0 OR trace_id = ${sql.string(filters.search)} OR conversation_id = ${sql.string(filters.search)})`
    : sql.empty;
  const groupClause = filters.groupId
    ? sql`AND has(groups, ${sql.string(filters.groupId)})`
    : sql.empty;
  return sql`
    ${stringFilter('model', filters.models)}
    ${stringFilter('provider', filters.providers)}
    ${stringFilter('name', filters.names)}
    ${stringFilter('type', filters.types)}
    ${filters.profileId ? sql`AND profile_id = ${sql.string(filters.profileId)}` : sql.empty}
    ${filters.conversationId ? sql`AND conversation_id = ${sql.string(filters.conversationId)}` : sql.empty}
    ${filters.sessionId ? sql`AND session_id = ${sql.string(filters.sessionId)}` : sql.empty}
    ${groupClause}
    ${errorClause}
    ${searchClause}
  `;
}

export interface AiScopedQueryInput {
  projectId: string;
  range: AiDateRange;
  filters?: IAiFilters;
}

function scopeWhere(input: AiScopedQueryInput): SqlFragment {
  return sql`
    project_id = ${sql.string(input.projectId)}
    AND ${dateRangeWhere(input.range)}
    ${filtersWhere(input.filters)}
  `;
}

const METRIC_COLUMNS = sql`
  countIf(type = 'generation') AS generations,
  count() AS events,
  uniq(trace_id) AS traces,
  uniq(profile_id) AS users,
  uniqIf(conversation_id, conversation_id != '') AS conversations,
  sum(total_cost) AS cost,
  sum(input_tokens) AS input_tokens,
  sum(output_tokens) AS output_tokens,
  sum(cache_read_tokens) AS cache_read_tokens,
  quantileIf(0.5)(latency_ms, type = 'generation') AS p50_latency_ms,
  quantileIf(0.95)(latency_ms, type = 'generation') AS p95_latency_ms,
  avgIf(latency_ms, type = 'generation') AS avg_latency_ms,
  countIf(is_error AND type = 'generation') AS errors
`;

export function overviewTotalsQuery(input: AiScopedQueryInput): SqlFragment {
  return sql`
    SELECT ${METRIC_COLUMNS}
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE ${scopeWhere(input)}
  `;
}

export function overviewSeriesQuery(
  input: AiScopedQueryInput & { interval: IInterval }
): SqlFragment {
  return sql`
    SELECT
      ${toStartOf('created_at', input.interval)} AS date,
      ${METRIC_COLUMNS}
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE ${scopeWhere(input)}
    GROUP BY date
    ORDER BY date ASC
    ${fillClause(input.range, input.interval)}
  `;
}

const DIMENSION_COLUMN: Record<AiBreakdownDimension, SqlFragment> = {
  model: sql`model`,
  provider: sql`provider`,
  name: sql`name`,
  profile: sql`profile_id`,
  conversation: sql`conversation_id`,
  group: sql`arrayJoin(groups)`,
  stopReason: sql`stop_reason`,
  errorCode: sql`JSONExtractString(error, 'code')`,
};

export function breakdownQuery(
  input: AiScopedQueryInput & { dimension: AiBreakdownDimension; limit: number }
): SqlFragment {
  const dimension = DIMENSION_COLUMN[input.dimension];
  const onlyErrors =
    input.dimension === 'errorCode' ? sql`AND is_error = true` : sql.empty;
  return sql`
    SELECT
      ${dimension} AS key,
      countIf(type = 'generation') AS generations,
      count() AS events,
      uniq(trace_id) AS traces,
      uniq(profile_id) AS users,
      sum(total_cost) AS cost,
      sum(input_tokens) + sum(output_tokens) AS tokens,
      avgIf(latency_ms, type = 'generation') AS avg_latency_ms,
      quantileIf(0.95)(latency_ms, type = 'generation') AS p95_latency_ms,
      countIf(is_error AND type = 'generation') AS errors,
      max(created_at) AS last_at
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE ${scopeWhere(input)}
      ${onlyErrors}
    GROUP BY key
    HAVING key != ''
    ORDER BY cost DESC, events DESC
    LIMIT ${sql.uint64(input.limit)}
  `;
}

export interface TraceListQueryInput extends AiScopedQueryInput {
  take: number;
  /** `started_at` of the last row of the previous page. */
  cursor?: string;
}

/**
 * Aggregates are aliased away from the column names (`first_profile_id`, not
 * `profile_id`): ClickHouse resolves a bare column in WHERE to a same-named
 * SELECT alias, which turns a filter into an aggregate and fails the query.
 */
export function traceListQuery(input: TraceListQueryInput): SqlFragment {
  const cursorClause = input.cursor
    ? sql`HAVING started_at < toDateTime64(${sql.string(input.cursor)}, 3)`
    : sql.empty;
  return sql`
    SELECT
      trace_id,
      min(created_at) AS started_at,
      max(toUnixTimestamp64Milli(created_at) + latency_ms) - toUnixTimestamp64Milli(min(created_at)) AS duration_ms,
      multiIf(
        anyIf(name, type = 'trace') != '', anyIf(name, type = 'trace'),
        countIf(type = 'generation' AND name != '') > 0, argMinIf(name, created_at, type = 'generation' AND name != ''),
        argMinIf(name, created_at, name != '')
      ) AS trace_name,
      argMin(profile_id, created_at) AS first_profile_id,
      argMin(device_id, created_at) AS first_device_id,
      argMin(session_id, created_at) AS first_session_id,
      argMin(conversation_id, created_at) AS first_conversation_id,
      argMin(id, created_at) AS first_id,
      countIf(type = 'generation') AS generations,
      count() AS events,
      sum(input_tokens) AS total_input_tokens,
      sum(output_tokens) AS total_output_tokens,
      sum(total_cost) AS cost,
      max(is_error) AS has_error,
      arrayDistinct(groupArrayIf(model, model != '')) AS models,
      arrayDistinct(arrayFlatten(groupArray(groups))) AS all_groups
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE ${scopeWhere(input)}
    GROUP BY trace_id
    ${cursorClause}
    ORDER BY started_at DESC
    LIMIT ${sql.uint64(input.take)}
  `;
}

export interface TraceQueryInput {
  projectId: string;
  traceId: string;
  /** Narrows partition pruning; the trace's rows are searched a day around it. */
  around?: string;
}

const AROUND_WINDOW = sql`INTERVAL 1 DAY`;

export function traceEventsQuery(input: TraceQueryInput): SqlFragment {
  const aroundClause = input.around
    ? sql`AND created_at BETWEEN ${sql.dateTime64(new Date(input.around), 3)} - ${AROUND_WINDOW} AND ${sql.dateTime64(new Date(input.around), 3)} + ${AROUND_WINDOW}`
    : sql.empty;
  return sql`
    SELECT ${AI_EVENT_COLUMNS}
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)}
      AND trace_id = ${sql.string(input.traceId)}
      ${aroundClause}
    ORDER BY created_at ASC
  `;
}

export interface EventListQueryInput extends AiScopedQueryInput {
  take: number;
  /** `created_at` of the last row of the previous page. */
  cursor?: string;
}

export function eventListQuery(input: EventListQueryInput): SqlFragment {
  const cursorClause = input.cursor
    ? sql`AND created_at < toDateTime64(${sql.string(input.cursor)}, 3)`
    : sql.empty;
  return sql`
    SELECT ${AI_EVENT_COLUMNS}
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE ${scopeWhere(input)}
      ${cursorClause}
    ORDER BY created_at DESC
    LIMIT ${sql.uint64(input.take)}
  `;
}

export function eventByIdQuery(input: {
  projectId: string;
  id: string;
  around?: string;
}): SqlFragment {
  const aroundClause = input.around
    ? sql`AND created_at BETWEEN ${sql.dateTime64(new Date(input.around), 3)} - ${AROUND_WINDOW} AND ${sql.dateTime64(new Date(input.around), 3)} + ${AROUND_WINDOW}`
    : sql.empty;
  return sql`
    SELECT ${AI_EVENT_COLUMNS}
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)}
      AND id = ${sql.uuid(input.id)}
      ${aroundClause}
    LIMIT 1
  `;
}

/** Lifetime usage of one profile, group or session, for the entity pages. */
export function entitySummaryQuery(input: {
  projectId: string;
  where: SqlFragment;
}): SqlFragment {
  return sql`
    SELECT
      countIf(type = 'generation') AS generations,
      uniq(trace_id) AS traces,
      uniqIf(conversation_id, conversation_id != '') AS conversations,
      sum(total_cost) AS cost,
      sum(input_tokens) AS input_tokens,
      sum(output_tokens) AS output_tokens,
      avgIf(latency_ms, type = 'generation') AS avg_latency_ms,
      countIf(is_error AND type = 'generation') AS errors,
      min(created_at) AS first_at,
      max(created_at) AS last_at,
      topKIf(3)(model, type = 'generation') AS top_models
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)}
      AND ${input.where}
  `;
}

export function filterValuesQuery(input: {
  projectId: string;
  range: AiDateRange;
}): SqlFragment {
  return sql`
    SELECT 'model' AS field, model AS value, count() AS count
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)} AND ${dateRangeWhere(input.range)} AND model != ''
    GROUP BY value
    UNION ALL
    SELECT 'provider' AS field, provider AS value, count() AS count
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)} AND ${dateRangeWhere(input.range)} AND provider != ''
    GROUP BY value
    UNION ALL
    SELECT 'name' AS field, name AS value, count() AS count
    FROM ${sql.id(AI_EVENTS_TABLE)}
    WHERE project_id = ${sql.string(input.projectId)} AND ${dateRangeWhere(input.range)} AND name != ''
    GROUP BY value
    ORDER BY field, count DESC
  `;
}
