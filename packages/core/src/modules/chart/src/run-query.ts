// The chart module's one ClickHouse entry point. The client is `deps.ch`, which
// puts the request's `requestId` on the query's log line. ClickHouse's JSON
// format returns every Int*/UInt* column as a string, so a caller's
// `count: number` only holds if it is parsed back out here, as `chQuery` does.

import {
  type SqlFragment,
  toStatement,
} from '@openpanel/db/src/clickhouse/sql';
import type { ServiceDeps } from '../../../services';

/** `timezone` travels as ClickHouse's `session_timezone` setting. */
export async function runQuery<T extends object>(
  deps: ServiceDeps,
  statement: SqlFragment,
  timezone?: string
): Promise<T[]> {
  const start = Date.now();
  const { query, query_params } = toStatement(statement);
  const paramNames = Object.keys(query_params);
  const result = await deps.ch.query({
    query,
    query_params: paramNames.length > 0 ? query_params : undefined,
    clickhouse_settings: timezone ? { session_timezone: timezone } : undefined,
  });
  const json = await result.json<T>();

  deps.logger.info(
    {
      query: cleanQuery(query),
      // Names only: bound values are user data and must not reach the logs.
      queryParams: paramNames.length > 0 ? paramNames : undefined,
      rows: json.rows,
      stats: json.statistics,
      elapsed: Date.now() - start,
    },
    'query info'
  );

  const keys = Object.keys(json.data[0] ?? {});
  return json.data.map((item) =>
    keys.reduce((acc, key) => {
      const meta = json.meta?.find((m) => m.name === key);
      const value = item[key as keyof T];
      acc[key as keyof T] =
        value && meta?.type.includes('Int')
          ? (Number.parseFloat(value as string) as T[keyof T])
          : value;
      return acc;
    }, {} as T)
  );
}

const NEWLINES = /\n/g;
const WHITESPACE_RUNS = /\s+/g;

function cleanQuery(query: string): string {
  return query.replace(NEWLINES, '').replace(WHITESPACE_RUNS, ' ').trim();
}
