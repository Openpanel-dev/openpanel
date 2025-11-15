import { Readable } from 'node:stream';
import type { ClickHouseSettings, ResponseJSON } from '@clickhouse/client';
import { ClickHouseLogLevel, createClient } from '@clickhouse/client';
import sqlstring from 'sqlstring';

import type { NodeClickHouseClientConfigOptions } from '@clickhouse/client/dist/config';
import { createLogger } from '@openpanel/logger';
import type { IInterval } from '@openpanel/validation';

export { createClient };

const logger = createLogger({ name: 'clickhouse' });

import type { Logger } from '@clickhouse/client';

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
    logger.debug(message, args);
  }
  debug({ message, args }: LogParams) {
    if (message.includes('Query:') && args?.response_status === 200) {
      return;
    }
    logger.debug(message, args);
  }
  info({ message, args }: LogParams) {
    logger.info(message, args);
  }
  warn({ message, args }: WarnLogParams) {
    logger.warn(message, args);
  }
  error({ message, args, err }: ErrorLogParams) {
    logger.error(message, {
      ...args,
      error: err,
    });
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
};

/**
 * Check if ClickHouse is running in clustered mode
 * Clustered mode = production (not self-hosted)
 * Non-clustered mode = self-hosted environments
 */
export function isClickhouseClustered(): boolean {
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

export const CLICKHOUSE_OPTIONS: NodeClickHouseClientConfigOptions = {
  max_open_connections: 30,
  request_timeout: 300000,
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 60000,
  },
  compression: {
    request: true,
  },
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
  },
  log: {
    LoggerClass: CustomLogger,
    level: ClickHouseLogLevel.DEBUG,
  },
};

export const originalCh = createClient({
  url: process.env.CLICKHOUSE_URL,
  ...CLICKHOUSE_OPTIONS,
});

const cleanQuery = (query?: string) =>
  typeof query === 'string'
    ? query.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
    : undefined;

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 500,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await operation();
      if (attempt > 0) {
        logger.info('Retry operation succeeded', { attempt });
      }
      return res;
    } catch (error: any) {
      lastError = error;

      if (
        error.message.includes('Connect') ||
        error.message.includes('socket hang up') ||
        error.message.includes('Timeout error')
      ) {
        const delay = baseDelay * 2 ** attempt;
        logger.warn(
          `Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms`,
          {
            error: error.message,
          },
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error; // Non-retriable error
    }
  }

  throw lastError;
}

export const ch = new Proxy(originalCh, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);

    if (property === 'insert') {
      return (...args: any[]) =>
        withRetry(() => {
          args[0].clickhouse_settings = {
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
            ...args[0].clickhouse_settings,
          };
          return value.apply(target, args);
        });
    }

    if (property === 'command') {
      return (...args: any[]) =>
        withRetry(() => {
          return value.apply(target, args);
        });
    }

    return value;
  },
});

export async function chQueryWithMeta<T extends Record<string, any>>(
  query: string,
  clickhouseSettings?: ClickHouseSettings,
): Promise<ResponseJSON<T>> {
  const start = Date.now();
  const res = await ch.query({
    query,
    clickhouse_settings: clickhouseSettings,
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

  logger.info('query info', {
    query: cleanQuery(query),
    rows: json.rows,
    stats: response.statistics,
    elapsed: Date.now() - start,
    clickhouseSettings,
  });

  return response;
}

export async function chInsertCSV(tableName: string, rows: string[]) {
  try {
    const now = performance.now();
    // Create a readable stream in binary mode for CSV (similar to EventBuffer)
    const csvStream = Readable.from(rows.join('\n'), {
      objectMode: false,
    });

    await ch.insert({
      table: tableName,
      values: csvStream,
      format: 'CSV',
      clickhouse_settings: {
        format_csv_allow_double_quotes: 1,
        format_csv_allow_single_quotes: 0,
      },
    });

    logger.info('CSV Insert successful', {
      elapsed: performance.now() - now,
      rows: rows.length,
    });
  } catch (error) {
    logger.error('CSV Insert failed:', error);
    throw error;
  }
}

export async function chQuery<T extends Record<string, any>>(
  query: string,
  clickhouseSettings?: ClickHouseSettings,
): Promise<T[]> {
  return (await chQueryWithMeta<T>(query, clickhouseSettings)).data;
}

export function formatClickhouseDate(
  date: Date | string,
  skipTime = false,
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
