// The overview module's one bridge to a ClickHouse client.
//
// `OverviewService`/`PagesService` keep V1's `constructor(client: typeof ch)`
// shape — `page-performance.ts` (mcp) constructs a fresh `PagesService` per
// call specifically to dodge a module-singleton mocking hazard, so a caller
// may still inject its own client. The module-scope `overviewService`/
// `pagesService` singletons construct with none, so the round-robin `ch`
// singleton is imported lazily here instead — importing
// `@openpanel/db/src/clickhouse/client` eagerly constructs a real ClickHouse
// client and a pino logger, and this module reaches nearly every core test
// file through the barrel (same reasoning as chart's `run-query.ts`).
//
// `chQuery` always goes through that singleton's `withRetry`, so it can't
// stand in for a caller-supplied client; this mirrors its exact behaviour
// (params, `session_timezone`, the same Int-meta coercion) either way.

import type { ClickHouseClient } from '@clickhouse/client';
import { type SqlFragment, toStatement } from '@openpanel/db/src/clickhouse/sql';

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

export async function runQuery<T extends object>(
  client: ClickHouseClient | undefined,
  statement: SqlFragment,
  timezone: string
): Promise<T[]> {
  const resolvedClient = client ?? (await loadChClient()).ch;
  const { query, query_params } = toStatement(statement);
  const result = await resolvedClient.query({
    query,
    query_params: Object.keys(query_params).length ? query_params : undefined,
    clickhouse_settings: { session_timezone: timezone },
  });
  const json = await result.json<T>();
  const keys = Object.keys(json.data[0] ?? {});
  // Same coercion `chQuery` applies: ClickHouse's JSON format returns every
  // Int*/UInt* column as a string, so the caller's shape (`count: number`)
  // only holds if we parse it back out here, same as V1's clix did.
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
