// The AI observability reads for the dashboard, plus what the ingest pipeline
// needs (normalisation, cost, the row builder).

import { sql } from '@openpanel/db/src/clickhouse/sql';
import { getSafeJson } from '@openpanel/shared';
import { chQuery } from '../../ch-query';
import type { ServiceDeps, Services } from '../../services';
import { convertClickhouseDateToJs } from '../../shared/ch-dates';
import { getGroupsByIds, type IServiceGroup } from '../group/group.service';
import {
  getProfilesCached,
  type IServiceProfile,
} from '../profile/profile.service';
import type { IInterval } from '../report/report.constants';
import type {
  AiBreakdownDimension,
  AiEventKind,
  IAiFilters,
} from './ai.constants';
import type { AiCostSource } from './src/pricing/cost';
import type { IClickhouseAiEvent } from './src/row';
import {
  type AiDateRange,
  breakdownQuery,
  entitySummaryQuery,
  eventByIdQuery,
  eventListQuery,
  filterValuesQuery,
  overviewSeriesQuery,
  overviewTotalsQuery,
  traceEventsQuery,
  traceListQuery,
} from './src/sql';

export type { NormalizedAiEvent } from './src/normalize';
export { normalizeAiPayload, serializeBounded } from './src/normalize';
export { resolveModelPrice } from './src/pricing/catalog';
export type { AiCost, AiCostSource } from './src/pricing/cost';
export { calculateAiCost } from './src/pricing/cost';
export type {
  AiEventIdentitySource,
  AiEventRowDraft,
  IClickhouseAiEvent,
} from './src/row';
export { buildAiEventRow } from './src/row';

export interface IServiceAiEvent {
  id: string;
  projectId: string;
  type: AiEventKind;
  traceId: string;
  spanId: string;
  parentId: string;
  conversationId: string;
  name: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  costSource: AiCostSource;
  latencyMs: number;
  timeToFirstTokenMs: number;
  isError: boolean;
  httpStatus: number;
  stopReason: string;
  isStream: boolean;
  /** Parsed JSON, or the raw text when the stored content was truncated. */
  modelParameters: unknown;
  input: unknown;
  output: unknown;
  tools: unknown;
  error: unknown;
  profileId: string;
  deviceId: string;
  sessionId: string;
  groups: string[];
  properties: Record<string, string>;
  createdAt: Date;
  profile?: IServiceProfile;
}

export interface IServiceAiTrace {
  id: string;
  name: string;
  startedAt: Date;
  durationMs: number;
  profileId: string;
  deviceId: string;
  sessionId: string;
  conversationId: string;
  firstEventId: string;
  generations: number;
  events: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  isError: boolean;
  models: string[];
  groups: string[];
  profile?: IServiceProfile;
}

export interface IAiMetrics {
  generations: number;
  events: number;
  traces: number;
  users: number;
  conversations: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  avgLatencyMs: number;
  errors: number;
  errorRate: number;
  costPerUser: number;
}

export interface IAiSeriesPoint extends IAiMetrics {
  date: string;
}

export interface IAiBreakdownRow {
  key: string;
  label: string;
  generations: number;
  events: number;
  traces: number;
  users: number;
  cost: number;
  tokens: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errors: number;
  lastAt: Date;
  profile?: IServiceProfile;
  group?: IServiceGroup;
}

export interface IAiEntitySummary {
  generations: number;
  traces: number;
  conversations: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  errors: number;
  firstAt: Date | null;
  lastAt: Date | null;
  topModels: string[];
}

interface MetricsRow {
  generations: string | number;
  events: string | number;
  traces: string | number;
  users: string | number;
  conversations: string | number;
  cost: number;
  input_tokens: string | number;
  output_tokens: string | number;
  cache_read_tokens: string | number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  avg_latency_ms: number | null;
  errors: string | number;
}

interface TraceRow {
  trace_id: string;
  started_at: string;
  duration_ms: string | number;
  name: string;
  profile_id: string;
  device_id: string;
  session_id: string;
  conversation_id: string;
  first_id: string;
  generations: string | number;
  events: string | number;
  input_tokens: string | number;
  output_tokens: string | number;
  cost: number;
  is_error: boolean | number;
  models: string[];
  groups: string[];
}

interface BreakdownRow {
  key: string;
  generations: string | number;
  events: string | number;
  traces: string | number;
  users: string | number;
  cost: number;
  tokens: string | number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  errors: string | number;
  last_at: string;
}

interface SummaryRow {
  generations: string | number;
  traces: string | number;
  conversations: string | number;
  cost: number;
  input_tokens: string | number;
  output_tokens: string | number;
  avg_latency_ms: number | null;
  errors: string | number;
  first_at: string;
  last_at: string;
  top_models: string[];
}

const PERCENT = 100;
const ERROR_RATE_DECIMALS = 1;
const CLICKHOUSE_EPOCH = '1970-01-01';

const num = (value: string | number | null | undefined): number =>
  value === null || value === undefined ? 0 : Number(value);

function parseContent(text: string): unknown {
  if (!text) {
    return null;
  }
  return getSafeJson<unknown>(text) ?? text;
}

function toDateOrNull(value: string): Date | null {
  return value && !value.startsWith(CLICKHOUSE_EPOCH)
    ? convertClickhouseDateToJs(value)
    : null;
}

export function transformAiEvent(row: IClickhouseAiEvent): IServiceAiEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    traceId: row.trace_id,
    spanId: row.span_id,
    parentId: row.parent_id,
    conversationId: row.conversation_id,
    name: row.name,
    model: row.model,
    provider: row.provider,
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    cacheReadTokens: num(row.cache_read_tokens),
    cacheWriteTokens: num(row.cache_write_tokens),
    reasoningTokens: num(row.reasoning_tokens),
    inputCost: num(row.input_cost),
    outputCost: num(row.output_cost),
    totalCost: num(row.total_cost),
    costSource: row.cost_source,
    latencyMs: num(row.latency_ms),
    timeToFirstTokenMs: num(row.time_to_first_token_ms),
    isError: Boolean(row.is_error),
    httpStatus: num(row.http_status),
    stopReason: row.stop_reason,
    isStream: Boolean(row.is_stream),
    modelParameters: parseContent(row.model_parameters),
    input: parseContent(row.input),
    output: parseContent(row.output),
    tools: parseContent(row.tools),
    error: parseContent(row.error),
    profileId: row.profile_id,
    deviceId: row.device_id,
    sessionId: row.session_id,
    groups: row.groups ?? [],
    properties: row.properties ?? {},
    createdAt: convertClickhouseDateToJs(row.created_at),
  };
}

function transformMetrics(row: MetricsRow | undefined): IAiMetrics {
  const generations = num(row?.generations);
  const users = num(row?.users);
  const errors = num(row?.errors);
  const cost = num(row?.cost);
  return {
    generations,
    events: num(row?.events),
    traces: num(row?.traces),
    users,
    conversations: num(row?.conversations),
    cost,
    inputTokens: num(row?.input_tokens),
    outputTokens: num(row?.output_tokens),
    cacheReadTokens: num(row?.cache_read_tokens),
    p50LatencyMs: Math.round(num(row?.p50_latency_ms)),
    p95LatencyMs: Math.round(num(row?.p95_latency_ms)),
    avgLatencyMs: Math.round(num(row?.avg_latency_ms)),
    errors,
    errorRate:
      generations > 0
        ? Number(
            ((errors / generations) * PERCENT).toFixed(ERROR_RATE_DECIMALS)
          )
        : 0,
    costPerUser: users > 0 ? cost / users : 0,
  };
}

function transformTrace(row: TraceRow): IServiceAiTrace {
  return {
    id: row.trace_id,
    name: row.name,
    startedAt: convertClickhouseDateToJs(row.started_at),
    durationMs: Math.max(0, num(row.duration_ms)),
    profileId: row.profile_id,
    deviceId: row.device_id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    firstEventId: row.first_id,
    generations: num(row.generations),
    events: num(row.events),
    inputTokens: num(row.input_tokens),
    outputTokens: num(row.output_tokens),
    cost: num(row.cost),
    isError: Boolean(row.is_error),
    models: row.models ?? [],
    groups: row.groups ?? [],
  };
}

function transformSummary(row: SummaryRow | undefined): IAiEntitySummary {
  return {
    generations: num(row?.generations),
    traces: num(row?.traces),
    conversations: num(row?.conversations),
    cost: num(row?.cost),
    inputTokens: num(row?.input_tokens),
    outputTokens: num(row?.output_tokens),
    avgLatencyMs: Math.round(num(row?.avg_latency_ms)),
    errors: num(row?.errors),
    firstAt: row ? toDateOrNull(row.first_at) : null,
    lastAt: row ? toDateOrNull(row.last_at) : null,
    topModels: row?.top_models ?? [],
  };
}

export interface AiOverviewInput {
  projectId: string;
  range: AiDateRange;
  interval: IInterval;
  timezone: string;
  filters?: IAiFilters;
}

export interface AiBreakdownInput {
  projectId: string;
  range: AiDateRange;
  dimension: AiBreakdownDimension;
  limit: number;
  filters?: IAiFilters;
}

export interface AiTraceListInput {
  projectId: string;
  range: AiDateRange;
  take: number;
  cursor?: string;
  filters?: IAiFilters;
}

export interface AiEventListInput extends AiTraceListInput {}

export function createAiService(deps: ServiceDeps, _services: () => Services) {
  const attachProfiles = async <
    T extends { profileId: string; deviceId: string },
  >(
    projectId: string,
    items: T[]
  ): Promise<(T & { profile?: IServiceProfile })[]> => {
    const ids = items
      .filter((item) => item.profileId && item.profileId !== item.deviceId)
      .map((item) => item.profileId);
    const profiles = await getProfilesCached(deps, ids, projectId);
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return items.map((item) => ({
      ...item,
      profile: byId.get(item.profileId),
    }));
  };

  async function getOverview(
    input: AiOverviewInput
  ): Promise<{ metrics: IAiMetrics; series: IAiSeriesPoint[] }> {
    const settings = { session_timezone: input.timezone };
    const [totals, series] = await Promise.all([
      chQuery<MetricsRow>(deps, overviewTotalsQuery(input), settings),
      chQuery<MetricsRow & { date: string }>(
        deps,
        overviewSeriesQuery(input),
        settings
      ),
    ]);
    return {
      metrics: transformMetrics(totals[0]),
      // Wall-clock bucket labels in the project's timezone, as ClickHouse
      // returned them; a JS Date would shift them by the server's offset.
      series: series.map((row) => ({
        ...transformMetrics(row),
        date: row.date,
      })),
    };
  }

  async function getBreakdown(
    input: AiBreakdownInput
  ): Promise<IAiBreakdownRow[]> {
    const rows = await chQuery<BreakdownRow>(deps, breakdownQuery(input));
    const items: IAiBreakdownRow[] = rows.map((row) => ({
      key: row.key,
      label: row.key,
      generations: num(row.generations),
      events: num(row.events),
      traces: num(row.traces),
      users: num(row.users),
      cost: num(row.cost),
      tokens: num(row.tokens),
      avgLatencyMs: Math.round(num(row.avg_latency_ms)),
      p95LatencyMs: Math.round(num(row.p95_latency_ms)),
      errors: num(row.errors),
      lastAt: convertClickhouseDateToJs(row.last_at),
    }));
    if (input.dimension === 'profile') {
      const profiles = await getProfilesCached(
        deps,
        items.map((item) => item.key),
        input.projectId
      );
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      return items.map((item) => ({ ...item, profile: byId.get(item.key) }));
    }
    if (input.dimension === 'group') {
      const groups = await getGroupsByIds(
        deps,
        input.projectId,
        items.map((item) => item.key)
      );
      const byId = new Map(groups.map((group) => [group.id, group]));
      return items.map((item) => ({
        ...item,
        label: byId.get(item.key)?.name ?? item.key,
        group: byId.get(item.key),
      }));
    }
    return items;
  }

  async function listTraces(
    input: AiTraceListInput
  ): Promise<{ items: IServiceAiTrace[]; meta: { next?: string } }> {
    const rows = await chQuery<TraceRow>(deps, traceListQuery(input));
    const items = await attachProfiles(
      input.projectId,
      rows.map(transformTrace)
    );
    const last = rows.at(-1);
    return {
      items,
      meta: {
        next: rows.length === input.take ? last?.started_at : undefined,
      },
    };
  }

  async function getTrace(input: {
    projectId: string;
    traceId: string;
    around?: string;
  }): Promise<IServiceAiEvent[]> {
    const rows = await chQuery<IClickhouseAiEvent>(
      deps,
      traceEventsQuery(input)
    );
    return attachProfiles(input.projectId, rows.map(transformAiEvent));
  }

  async function listEvents(
    input: AiEventListInput
  ): Promise<{ items: IServiceAiEvent[]; meta: { next?: string } }> {
    const rows = await chQuery<IClickhouseAiEvent>(deps, eventListQuery(input));
    const items = await attachProfiles(
      input.projectId,
      rows.map(transformAiEvent)
    );
    const last = rows.at(-1);
    return {
      items,
      meta: {
        next: rows.length === input.take ? last?.created_at : undefined,
      },
    };
  }

  async function getEvent(input: {
    projectId: string;
    id: string;
    around?: string;
  }): Promise<IServiceAiEvent | null> {
    const rows = await chQuery<IClickhouseAiEvent>(deps, eventByIdQuery(input));
    const row = rows[0];
    if (!row) {
      return null;
    }
    const [event] = await attachProfiles(input.projectId, [
      transformAiEvent(row),
    ]);
    return event ?? null;
  }

  async function getProfileSummary(input: {
    projectId: string;
    profileId: string;
  }): Promise<IAiEntitySummary> {
    const rows = await chQuery<SummaryRow>(
      deps,
      entitySummaryQuery({
        projectId: input.projectId,
        where: sql`profile_id = ${sql.string(input.profileId)}`,
      })
    );
    return transformSummary(rows[0]);
  }

  async function getGroupSummary(input: {
    projectId: string;
    groupId: string;
  }): Promise<IAiEntitySummary> {
    const rows = await chQuery<SummaryRow>(
      deps,
      entitySummaryQuery({
        projectId: input.projectId,
        where: sql`has(groups, ${sql.string(input.groupId)})`,
      })
    );
    return transformSummary(rows[0]);
  }

  async function getSessionSummary(input: {
    projectId: string;
    sessionId: string;
  }): Promise<IAiEntitySummary> {
    const rows = await chQuery<SummaryRow>(
      deps,
      entitySummaryQuery({
        projectId: input.projectId,
        where: sql`session_id = ${sql.string(input.sessionId)}`,
      })
    );
    return transformSummary(rows[0]);
  }

  async function getFilterValues(input: {
    projectId: string;
    range: AiDateRange;
  }): Promise<
    Record<'model' | 'provider' | 'name', { value: string; count: number }[]>
  > {
    const rows = await chQuery<{
      field: 'model' | 'provider' | 'name';
      value: string;
      count: string | number;
    }>(deps, filterValuesQuery(input));
    const values = { model: [], provider: [], name: [] } as Record<
      'model' | 'provider' | 'name',
      { value: string; count: number }[]
    >;
    for (const row of rows) {
      values[row.field]?.push({ value: row.value, count: num(row.count) });
    }
    return values;
  }

  return {
    getOverview,
    getBreakdown,
    listTraces,
    getTrace,
    listEvents,
    getEvent,
    getProfileSummary,
    getGroupSummary,
    getSessionSummary,
    getFilterValues,
  };
}
