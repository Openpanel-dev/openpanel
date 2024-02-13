import { createClient } from '@clickhouse/client';

export const ch = createClient({
  host: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DB,
});

interface ClickhouseJsonResponse<T> {
  data: T[];
  rows: number;
  statistics: { elapsed: number; rows_read: number; bytes_read: number };
  meta: { name: string; type: string }[];
}

export async function chQueryAll<T extends Record<string, any>>(
  query: string
): Promise<ClickhouseJsonResponse<T>> {
  const res = await ch.query({
    query,
  });
  const json = await res.json<ClickhouseJsonResponse<T>>();
  return {
    ...json,
    data: json.data.map((item) => {
      const keys = Object.keys(item);
      return keys.reduce((acc, key) => {
        const meta = json.meta.find((m) => m.name === key);
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
}

export async function chQuery<T extends Record<string, any>>(
  query: string
): Promise<T[]> {
  return (await chQueryAll<T>(query)).data;
}

export function formatClickhouseDate(_date: Date | string) {
  const date = typeof _date === 'string' ? new Date(_date) : _date;
  return date.toISOString().replace('T', ' ').replace(/Z+$/, '');
}

export function convertClickhouseDateToJs(date: string) {
  return new Date(date.replace(' ', 'T') + 'Z');
}
