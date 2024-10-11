import type { ResponseJSON } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';
import { escape } from 'sqlstring';

import { createLogger } from '@openpanel/logger';
import type { IInterval } from '@openpanel/validation';

const logger = createLogger({ name: 'clickhouse' });

export const TABLE_NAMES = {
  events: 'events_v2',
  profiles: 'profiles',
  alias: 'profile_aliases',
  self_hosting: 'self_hosting',
  events_bots: 'events_bots',
  dau_mv: 'dau_mv',
};

export const originalCh = createClient({
  url: process.env.CLICKHOUSE_URL,
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
});

export const ch = new Proxy(originalCh, {
  get(target, property, receiver) {
    if (property === 'insert' || property === 'query') {
      return async (...args: any[]) => {
        const childLogger = logger.child({
          query: args[0].query,
          property,
        });
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
            childLogger.error('Captured error', {
              error,
            });
            await new Promise((resolve) => setTimeout(resolve, 500));
            try {
              // Retry once
              childLogger.info('Retrying query');
              if (property in target) {
                // @ts-expect-error
                return await target[property](...args);
              }
            } catch (retryError) {
              logger.error('Retry failed', retryError);
              throw retryError; // Rethrow or handle as needed
            }
          } else {
            logger.error('query failed', {
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
    query,
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
  _date: Date | string,
  skipTime = false,
): string {
  const date = typeof _date === 'string' ? new Date(_date) : _date;
  if (skipTime) {
    return date.toISOString().split('T')[0]!;
  }
  return date.toISOString().replace('T', ' ').replace(/Z+$/, '');
}

export function toDate(str: string, interval?: IInterval) {
  if (!interval || interval === 'minute' || interval === 'hour') {
    if (str.match(/\d{4}-\d{2}-\d{2}/)) {
      return escape(str);
    }

    return str;
  }

  if (str.match(/\d{4}-\d{2}-\d{2}/)) {
    return `toDate(${escape(str)})`;
  }

  return `toDate(${str})`;
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(`${date.replace(' ', 'T')}Z`);
}
