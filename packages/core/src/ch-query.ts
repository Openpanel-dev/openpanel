// Core's ClickHouse read path, bound to the scope's client.
//
// The six modules on the runtime path used to reach ClickHouse through `await
// import('@openpanel/db/src/clickhouse/client')` and call that package's
// `chQuery`. That client has no request scope, so the requestId minted at the
// edge stopped there. These two functions are `chQuery` / `chQueryWithMeta`
// over `deps.ch` — the same round-robin/retry proxy `main.ts` builds and hands
// to every scope — and `deps.logger`, so the `query info` line carries the
// request's id.
//
// Behaviour is @openpanel/db's, unchanged: `deps.ch.query` IS `withRetry
// (client => client.query(...))`, the same transport, and the Int-meta coercion
// below is the same one — ClickHouse's JSON format returns every Int*/UInt*
// column as a string, so a caller's `count: number` only holds if it is parsed
// back out here. The one field that cannot survive the move is `host`: the
// retry proxy does not report which replica served the query.
// chart/src/run-query.ts made the same trade.
//
// `@openpanel/db/src/clickhouse/sql` is a value import and stays one: ADR-013
// puts the `sql` tag in packages/db by name, and it is a compile-time template
// tag with no client and no request scope.

import type { ClickHouseSettings, ResponseJSON } from '@clickhouse/client';
import {
  type SqlFragment,
  toStatement,
} from '@openpanel/db/src/clickhouse/sql';
import type { ServiceDeps } from './services';

/** All these two need is the scope's client and its logger — narrowed so the
 *  buffers, whose `BufferDeps` is not a `ServiceDeps`, can call them too. */
export type ChScope = Pick<ServiceDeps, 'ch' | 'logger'>;

/** A raw statement or an ADR-013 fragment carrying its own bound params. */
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
