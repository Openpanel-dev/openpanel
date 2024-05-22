import type { ResponseJSON } from '@clickhouse/client';
import { createClient } from '@clickhouse/client';

export const ch = createClient({
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DB,
  max_open_connections: 10,
  keep_alive: {
    enabled: true,
  },
});

export const chNew = process.env.CLICKHOUSE_URL_NEW
  ? createClient({
      url: process.env.CLICKHOUSE_URL_NEW,
      username: process.env.CLICKHOUSE_USER,
      password: process.env.CLICKHOUSE_PASSWORD,
      database: process.env.CLICKHOUSE_DB,
      max_open_connections: 10,
      keep_alive: {
        enabled: true,
      },
    })
  : {
      query: async () => {
        return Promise.reject(new Error('Clickhouse URL not configured'));
      },
      insert: async () => {
        return Promise.reject(new Error('Clickhouse URL not configured'));
      },
    };

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
    `Query: (${Date.now() - start}ms, ${response.statistics?.elapsed}ms)`,
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
