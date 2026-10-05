// Core's ClickHouse read path, bound to the scope's client; it logs through
// `deps.logger` so the `query info` line carries the request's id.
//
// The Int-meta coercion below exists because ClickHouse's JSON format returns
// every Int*/UInt* column as a string. `host` cannot survive the retry proxy:
// it does not report which replica served the query.

import type { ClickHouseSettings, ResponseJSON } from '@clickhouse/client';
import {
  type SqlFragment,
  toStatement,
} from '@openpanel/db/src/clickhouse/sql';
import type { ServiceDeps } from './services';

/** Narrowed so the buffers, whose `BufferDeps` is not a `ServiceDeps`, can call these too. */
export type ChScope = Pick<ServiceDeps, 'ch' | 'logger'>;

/** A raw statement or a SqlFragment carrying its own bound params. */
export type ChQueryInput = string | SqlFragment;

const NEWLINES = /\n/g;
const WHITESPACE_RUNS = /\s+/g;

function cleanQuery(query: string): string {
  return query.replace(NEWLINES, '').replace(WHITESPACE_RUNS, ' ').trim();
}

export async function chQueryWithMeta<T extends object>(
  deps: ChScope,
  query: ChQueryInput,
  clickhouseSettings?: ClickHouseSettings
): Promise<ResponseJSON<T>> {
  const start = Date.now();
  const statement = toStatement(query);
  const paramNames = Object.keys(statement.query_params);
  const hasParams = paramNames.length > 0;

  const res = await deps.ch.query({
    query: statement.query,
    query_params: hasParams ? statement.query_params : undefined,
    clickhouse_settings: clickhouseSettings,
  });
  const json = await res.json<T>();

  const keys = Object.keys(json.data[0] ?? {});
  const response = {
    ...json,
    data: json.data.map((item) =>
      keys.reduce((acc, key) => {
        const meta = json.meta?.find((m) => m.name === key);
        const value = item[key as keyof T];
        acc[key as keyof T] =
          value && meta?.type.includes('Int')
            ? (Number.parseFloat(value as string) as T[keyof T])
            : value;
        return acc;
      }, {} as T)
    ),
  };

  deps.logger.info(
    {
      query: cleanQuery(statement.query),
      // Names only: bound values are user data and must not reach the logs.
      queryParams: hasParams ? paramNames : undefined,
      rows: json.rows,
      stats: response.statistics,
      elapsed: Date.now() - start,
      clickhouseSettings,
    },
    'query info'
  );

  return response;
}

export async function chQuery<T extends object>(
  deps: ChScope,
  query: ChQueryInput,
  clickhouseSettings?: ClickHouseSettings
): Promise<T[]> {
  return (await chQueryWithMeta<T>(deps, query, clickhouseSettings)).data;
}
