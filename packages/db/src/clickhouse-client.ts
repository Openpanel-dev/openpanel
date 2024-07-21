import type { ResponseJSON } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';

export const TABLE_NAMES = {
  events: 'events_v2',
  profiles: 'profiles',
};

export const originalCh = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DB,
  max_open_connections: 30,
  request_timeout: 30000,
  keep_alive: {
    enabled: true,
    idle_socket_ttl: 8000,
  },
  compression: {
    request: true,
  },
});

export const ch = new Proxy(originalCh, {
  get(target, property, receiver) {
    if (property === 'insert' || property === 'query') {
      return async (...args: any[]) => {
        try {
          // First attempt
          if (property in target) {
            // @ts-expect-error
            return await target[property](...args);
          }
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            (error.message.includes('socket hang up') ||
              error.message.includes('Timeout error'))
          ) {
            console.info(
              `Caught ${error.message} error on ${property.toString()}, retrying once.`
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
            try {
              // Retry once
              if (property in target) {
                // @ts-expect-error
                return await target[property](...args);
              }
            } catch (retryError) {
              console.error(
                `Retry failed for ${property.toString()}:`,
                retryError
              );
              throw retryError; // Rethrow or handle as needed
            }
          } else {
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
  query: string
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
              ? parseFloat(item[key] as string)
              : item[key],
        };
      }, {} as T);
    }),
  };

  console.log(
    `Query: (${Date.now() - start}ms, ${response.statistics?.elapsed}ms), Rows: ${json.rows}`,
    query
  );

  return response;
}

export async function chQuery<T extends Record<string, any>>(
  query: string
): Promise<T[]> {
  return (await chQueryWithMeta<T>(query)).data;
}

export function formatClickhouseDate(_date: Date | string) {
  const date = typeof _date === 'string' ? new Date(_date) : _date;
  return date.toISOString().replace('T', ' ').replace(/Z+$/, '');
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(date.replace(' ', 'T') + 'Z');
}
