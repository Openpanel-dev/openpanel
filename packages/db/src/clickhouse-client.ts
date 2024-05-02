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

export async function chQueryWithMeta<T extends Record<string, any>>(
  query: string
): Promise<ResponseJSON<T>> {
  console.log('Query:', query);
  const start = Date.now();
  const res = await ch.query({
    query,
  });
  const json = await res.json<T>();
  const response = {
    ...json,
    data: json.data.map((item) => {
      const keys = Object.keys(item);
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

  console.log(`Clickhouse query took ${response.statistics?.elapsed}ms`);
  console.log(`chQuery took ${Date.now() - start}ms`);

  return response;
}

export async function chQuery<T extends Record<string, any>>(
  query: string
): Promise<T[]> {
  return (await chQueryWithMeta<T>(query)).data;
}

export function formatClickhouseDate(_date: Date | string) {
  const date = typeof _date === 'string' ? new Date(_date) : _date;
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/Z+$/, '')
    .replace(/\.[0-9]+$/, '');
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(date.replace(' ', 'T') + 'Z');
}
