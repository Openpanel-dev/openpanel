import type { ResponseJSON } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';
import { escape } from 'sqlstring';

import type { NodeClickHouseClientConfigOptions } from '@clickhouse/client/dist/config';
import { createLogger } from '@openpanel/logger';
import type { IInterval } from '@openpanel/validation';

export { createClient };

const logger = createLogger({ name: 'clickhouse' });

export const TABLE_NAMES = {
  events: 'events_distributed',
  profiles: 'profiles_distributed',
  alias: 'profile_aliases_distributed',
  self_hosting: 'self_hosting_distributed',
  events_bots: 'events_bots_distributed',
  dau_mv: 'dau_mv_distributed',
  event_names_mv: 'distinct_event_names_mv_distributed',
  event_property_values_mv: 'event_property_values_mv_distributed',
  cohort_events_mv: 'cohort_events_mv_distributed',
};

export const CLICKHOUSE_OPTIONS: NodeClickHouseClientConfigOptions = {
  max_open_connections: 30,
  request_timeout: 30000,
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 8000,
  },
  compression: {
    request: true,
  },
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
  },
};

export const originalCh = createClient({
  // TODO: remove this after migration
  url: process.env.CLICKHOUSE_URL_DIRECT ?? process.env.CLICKHOUSE_URL,
  ...CLICKHOUSE_OPTIONS,
});

const cleanQuery = (query?: string) =>
  typeof query === 'string'
    ? query.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
    : undefined;

const createChildLogger = (property: string, args?: any[]) => {
  if (property === 'insert') {
    return logger.child({
      property,
      table: args?.[0]?.table,
      values: (args?.[0]?.values || []).length,
    });
  }

  return logger.child({
    property,
    table: args?.[0]?.table,
    query: cleanQuery(args?.[0]?.query),
  });
};

export const ch = new Proxy(originalCh, {
  get(target, property, receiver) {
    if (property === 'insert' || property === 'query') {
      return async (...args: any[]) => {
        const childLogger = createChildLogger(property, args);

        if (property === 'insert') {
          childLogger.info('insert info');
        }

        try {
          // First attempt
          if (property in target) {
            // @ts-expect-error
            return await target[property](...args);
          }
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            (error.message.includes('Connect') ||
              error.message.includes('socket hang up') ||
              error.message.includes('Timeout error'))
          ) {
            childLogger.error('First failed attempt', {
              error,
            });
            await new Promise((resolve) => setTimeout(resolve, 500));
            try {
              // Retry once
              childLogger.info(`Retrying ${property}`);
              if (property in target) {
                // @ts-expect-error
                return await target[property](...args);
              }
            } catch (retryError) {
              childLogger.error('Second failed attempt', retryError);
              throw retryError; // Rethrow or handle as needed
            }
          } else {
            childLogger.error('Failed without retry', {
              ...args[0],
              error,
            });

            // Handle other errors or rethrow them
            throw error;
          }
        }
      };
    }
    return Reflect.get(target, property, receiver);
  },
});

export async function chQueryWithMeta<T extends Record<string, any>>(
  query: string,
): Promise<ResponseJSON<T>> {
  const start = Date.now();
  const res = await ch.query({
    query,
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
  });

  return response;
}

export async function chQuery<T extends Record<string, any>>(
  query: string,
): Promise<T[]> {
  return (await chQueryWithMeta<T>(query)).data;
}

export function formatClickhouseDate(
  date: Date | string,
  skipTime = false,
): string {
  if (typeof date === 'string') {
    if (skipTime) {
      return date.slice(0, 10);
    }
    return date.slice(0, 19).replace('T', ' ');
  }

  if (skipTime) {
    return date.toISOString().split('T')[0]!;
  }
  return date.toISOString().replace('T', ' ').replace(/Z+$/, '');
}

export function toDate(str: string, interval?: IInterval) {
  // If it does not match the regex it's a column name eg 'created_at'
  if (!interval || interval === 'minute' || interval === 'hour') {
    if (str.match(/\d{4}-\d{2}-\d{2}/)) {
      return escape(str);
    }

    return str;
  }

  if (str.match(/\d{4}-\d{2}-\d{2}/)) {
    return `toDate(${escape(str.split(' ')[0])})`;
  }

  return `toDate(${str})`;
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(`${date.replace(' ', 'T')}Z`);
}
