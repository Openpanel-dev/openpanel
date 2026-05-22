import type {
  ClickHouseClient,
  ClickHouseSettings,
  ResponseJSON,
} from '@clickhouse/client';
import { ClickHouseLogLevel, createClient } from '@clickhouse/client';
import type { NodeClickHouseClientConfigOptions } from '@clickhouse/client/dist/config';
import { createLogger } from '@openpanel/logger';
import type { IInterval } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import { RoundRobinPicker, withRoundRobinRetry } from './round-robin';

export { createClient } from '@clickhouse/client';

const logger = createLogger({ name: 'clickhouse' });

import type { Logger } from '@clickhouse/client';
import { getSafeJson } from '@openpanel/json';

// All three LogParams types are exported by the client
interface LogParams {
  module: string;
  message: string;
  args?: Record<string, unknown>;
}
type ErrorLogParams = LogParams & { err: Error };
type WarnLogParams = LogParams & { err?: Error };

class CustomLogger implements Logger {
  trace({ message, args }: LogParams) {
    logger.debug({ args }, message);
  }
  debug({ message, args }: LogParams) {
    if (message.includes('Query:') && args?.response_status === 200) {
      return;
    }
    logger.debug({ args }, message);
  }
  info({ message, args }: LogParams) {
    logger.info({ args }, message);
  }
  warn({ message, args }: WarnLogParams) {
    logger.warn({ args }, message);
  }
  error({ message, args, err }: ErrorLogParams) {
    logger.error({ err, args }, message);
  }
}

export const TABLE_NAMES = {
  events: 'events',
  profiles: 'profiles',
  alias: 'profile_aliases',
  self_hosting: 'self_hosting',
  events_bots: 'events_bots',
  dau_mv: 'dau_mv',
  event_names_mv: 'distinct_event_names_mv',
  event_property_values_mv: 'event_property_values_mv',
  cohort_events_mv: 'cohort_events_mv',
  sessions: 'sessions',
  events_imports: 'events_imports',
  session_replay_chunks: 'session_replay_chunks',
  gsc_daily: 'gsc_daily',
  gsc_pages_daily: 'gsc_pages_daily',
  gsc_queries_daily: 'gsc_queries_daily',
  groups: 'groups',
  cohort_members: 'cohort_members',
  cohort_metadata: 'cohort_metadata',
  profile_event_summary_mv: 'profile_event_summary_mv',
  profile_event_property_summary_mv: 'profile_event_property_summary_mv',
};

/**
 * Check if ClickHouse is running in clustered mode
 * Clustered mode = production (not self-hosted)
 * Non-clustered mode = self-hosted environments
 */
export function isClickhouseClustered(): boolean {
  if (
    process.env.CLICKHOUSE_CLUSTER === 'true' ||
    process.env.CLICKHOUSE_CLUSTER === '1'
  ) {
    return true;
  }

  return !(
    process.env.SELF_HOSTED === 'true' || process.env.SELF_HOSTED === '1'
  );
}

/**
 * Get the replicated table name for mutations
 * In clustered mode, returns table_name_replicated
 * In non-clustered mode, returns the original table name
 */
export function getReplicatedTableName(tableName: string): string {
  if (isClickhouseClustered()) {
    return `${tableName}_replicated ON CLUSTER '{cluster}'`;
  }
  return tableName;
}

function getClickhouseSettings(): ClickHouseSettings {
  const additionalSettings =
    getSafeJson<ClickHouseSettings>(process.env.CLICKHOUSE_SETTINGS || '{}') ||
    {};

  return {
    distributed_product_mode: 'allow',
    date_time_input_format: 'best_effort',
    ...(process.env.CLICKHOUSE_SETTINGS_REMOVE_CONVERT_ANY_JOIN
      ? {}
      : {
          query_plan_convert_any_join_to_semi_or_anti_join: 0,
        }),
    ...additionalSettings,
  };
}

// Request gzip is on by default — pays CPU on the worker to send less data
// over the wire. For payload-heavy buffers (replay) the gzip step happens on
// the single Node main thread and can block the event loop, so it's worth
// being able to flip it off to test. Set CLICKHOUSE_REQUEST_COMPRESSION=false
// to disable.
const requestCompressionEnabled =
  process.env.CLICKHOUSE_REQUEST_COMPRESSION !== 'false' &&
  process.env.CLICKHOUSE_REQUEST_COMPRESSION !== '0';

// Pool size per worker process. With parallel chunk inserts (cap 5 per
// flush) and a few buffers potentially flushing concurrently across cluster
// nodes, the previous 30 left headroom but might be tight at peak. Set
// CLICKHOUSE_MAX_OPEN_CONNECTIONS to override.
const maxOpenConnections = process.env.CLICKHOUSE_MAX_OPEN_CONNECTIONS
  ? Math.max(
      1,
      Number.parseInt(process.env.CLICKHOUSE_MAX_OPEN_CONNECTIONS, 10)
    )
  : 50;

// Per-request timeout. Was 300_000 (5 min) — way too long for fast failover
// against a dead node, and after the Hetzner LB story we want stuck inserts
// to fail and retry on a different node well before 5 min. 30s is enough for
// any legitimate batch insert in this codebase. Bumpable via env if needed.
const requestTimeoutMs = process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS
  ? Math.max(
      1000,
      Number.parseInt(process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS, 10)
    )
  : 30_000;

// How long to skip a node after a connection failure, before trying it
// again. Short by default — we want fast recovery once a node comes back.
const unhealthyMarkMs = process.env.CLICKHOUSE_UNHEALTHY_MARK_MS
  ? Math.max(0, Number.parseInt(process.env.CLICKHOUSE_UNHEALTHY_MARK_MS, 10))
  : 5000;

export const CLICKHOUSE_OPTIONS: NodeClickHouseClientConfigOptions = {
  max_open_connections: maxOpenConnections,
  request_timeout: requestTimeoutMs,
  keep_alive: {
    enabled: true,
    // Must be lower than server-side keep_alive_timeout (default 10s) so we
    // never reuse a socket the server has already closed.
    idle_socket_ttl: 7000,
  },
  compression: {
    request: requestCompressionEnabled,
  },
  clickhouse_settings: getClickhouseSettings(),
  log: {
    LoggerClass: CustomLogger,
    level: ClickHouseLogLevel.DEBUG,
  },
  // Custom JSON serializer used on inserts. For buffers that already
  // hold JSONEachRow lines as strings (event/replay/bot/group — pulled
  // straight out of Redis), this is a passthrough — no JSON.stringify
  // on the hot path. For buffers that pass real objects (session /
  // profile, which need to parse + transform before inserting), it
  // falls back to JSON.stringify. The client appends '\n' itself.
  json: {
    stringify: <T>(value: T): string =>
      typeof value === 'string' ? value : JSON.stringify(value),
  },
};

// CLICKHOUSE_URL accepts a single URL or comma-separated list. With a list,
// we round-robin across nodes ourselves and fail over on connection errors —
// avoids putting an L4 LB on the hot path.
//
// Tests sometimes import this module without CLICKHOUSE_URL set; in that
// case we fall back to a single client created the same way the old code
// did (URL = undefined, delegated to the client library's own handling).
const rawClickhouseUrls = (process.env.CLICKHOUSE_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const clickhouseUrls = rawClickhouseUrls.length > 0 ? rawClickhouseUrls : [''];

const clients: ClickHouseClient[] = clickhouseUrls.map((url) =>
  createClient({
    url: url || process.env.CLICKHOUSE_URL,
    ...CLICKHOUSE_OPTIONS,
  })
);

const picker = new RoundRobinPicker(clients, clickhouseUrls, unhealthyMarkMs);

function maskUrlCredentials(url: string): string {
  if (!url) {
    return '<unset>';
  }
  try {
    const u = new URL(url);
    if (u.username) {
      u.username = u.username.slice(0, 2) + '*'.repeat(u.username.length - 2);
    }
    if (u.password) {
      u.password = '***';
    }
    return u.toString();
  } catch {
    // Malformed URL — fall back to the original; better than crashing module
    // load in test envs where CLICKHOUSE_URL may be empty/garbage.
    return url;
  }
}

logger.info(
  {
    nodeCount: clients.length,
    urls: clickhouseUrls.map(maskUrlCredentials),
    requestTimeoutMs,
    unhealthyMarkMs,
    options: { ...CLICKHOUSE_OPTIONS, log: undefined },
  },
  'ClickHouse clients initialized'
);

// Backwards-compat export. Some callers (notably gsc.ts) use `originalCh`
// directly to bypass the retry/round-robin layer for one-off DDL or for
// places where retry semantics aren't wanted. Points at the first node.
export const originalCh = clients[0]!;

const cleanQuery = (query?: string) =>
  typeof query === 'string'
    ? query.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
    : undefined;

/**
 * Run `operation` against the next round-robin node, retrying on the next
 * node when a connection error is hit. Non-connection errors (SQL, auth,
 * 4xx) propagate immediately.
 *
 * `operation` receives the picked client and a context with the node URL
 * (useful for adding `host` to log lines / metrics).
 */
export async function withRetry<T>(
  operation: (
    client: ClickHouseClient,
    ctx: { url: string; index: number }
  ) => Promise<T>
): Promise<T> {
  return withRoundRobinRetry(picker, operation, logger);
}

/** Best-effort URL → hostname extraction for log labels. */
function urlHostname(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

const INSERT_DEFAULT_SETTINGS: ClickHouseSettings = {
  // Increase insert timeouts and buffer sizes for large batches
  max_execution_time: 300,
  max_insert_block_size: '500000',
  max_http_get_redirects: '0',
  // Ensure JSONEachRow stays efficient
  input_format_parallel_parsing: 1,
  // Keep long-running inserts/queries from idling out at proxies by sending progress headers
  send_progress_in_http_headers: 1,
  http_headers_progress_interval_ms: '50000',
  // Ensure server holds the connection until the query is finished
  wait_end_of_query: 1,
};

/**
 * High-level CH client. For insert/command/query, picks a node round-robin
 * and retries on a *different* node if the connection fails. The methods
 * live as own-properties on the proxy target so `vi.spyOn(ch, 'insert')`
 * works in tests. Other method accesses (rare — config readers, instance
 * checks) fall through to the first client.
 */
const chTarget = {
  insert: (params: any) =>
    withRetry((client) => {
      params.clickhouse_settings = {
        ...INSERT_DEFAULT_SETTINGS,
        ...params.clickhouse_settings,
      };
      return client.insert(params);
    }),
  command: (params: any) => withRetry((client) => client.command(params)),
  query: (params: any) => withRetry((client) => client.query(params)),
};

export const ch = new Proxy(chTarget as unknown as ClickHouseClient, {
  get(target, property, receiver) {
    if (property in target) {
      return Reflect.get(target, property, receiver);
    }
    return (originalCh as any)[property];
  },
}) as ClickHouseClient;

export async function chQueryWithMeta<T extends Record<string, any>>(
  query: string,
  clickhouseSettings?: ClickHouseSettings
): Promise<ResponseJSON<T>> {
  const start = Date.now();
  let host: string | undefined;
  const res = await withRetry((client, ctx) => {
    host = urlHostname(ctx.url);
    return client.query({
      query,
      clickhouse_settings: clickhouseSettings,
    });
  });
  const json = await res.json<T>();
  const keys = Object.keys(json.data[0] || {});
  const response = {
    ...json,
    data: json.data.map((item) => {
      return keys.reduce((acc, key) => {
        const meta = json.meta?.find((m) => m.name === key);
        return {
          ...acc,
          [key]:
            item[key] && meta?.type.includes('Int')
              ? Number.parseFloat(item[key] as string)
              : item[key],
        };
      }, {} as T);
    }),
  };

  logger.info(
    {
      host,
      query: cleanQuery(query),
      rows: json.rows,
      stats: response.statistics,
      elapsed: Date.now() - start,
      clickhouseSettings,
    },
    'query info'
  );

  return response;
}

export async function chQuery<T extends Record<string, any>>(
  query: string,
  clickhouseSettings?: ClickHouseSettings
): Promise<T[]> {
  return (await chQueryWithMeta<T>(query, clickhouseSettings)).data;
}

export function formatClickhouseDate(
  date: Date | string,
  skipTime = false
): string {
  if (skipTime) {
    return new Date(date).toISOString().split('T')[0]!;
  }
  return new Date(date)
    .toISOString()
    .replace('T', ' ')
    .replace(/(\.\d{3})?Z+$/, '');
}

export function toDate(str: string, interval?: IInterval) {
  // If it does not match the regex it's a column name eg 'created_at'
  if (!interval || interval === 'minute' || interval === 'hour') {
    if (str.match(/\d{4}-\d{2}-\d{2}/)) {
      return sqlstring.escape(str);
    }

    return str;
  }

  if (str.match(/\d{4}-\d{2}-\d{2}/)) {
    return `toDate(${sqlstring.escape(str.split(' ')[0])})`;
  }

  return `toDate(${str})`;
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(`${date.replace(' ', 'T')}Z`);
}

const ROLLUP_DATE_PREFIX = '1970-01-01';
export function isClickhouseDefaultMinDate(date: string): boolean {
  return date.startsWith(ROLLUP_DATE_PREFIX) || date.startsWith('1969-12-31');
}
export function toNullIfDefaultMinDate(date?: string | null): Date | null {
  if (!date) {
    return null;
  }
  return isClickhouseDefaultMinDate(date)
    ? null
    : convertClickhouseDateToJs(date);
}
