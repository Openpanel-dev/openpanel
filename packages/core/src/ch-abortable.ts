// A work scope's ClickHouse reads, bound to that scope's AbortSignal (M36-001),
// so a read whose answer nobody can receive stops on the server instead of
// running to completion.
//
// Aborting the HTTP call alone does not stop the query: ClickHouse only cancels
// on client close for a READ-ONLY query with
// `cancel_http_readonly_queries_on_client_close` set (measured on 26.1).
// `readonly: 2` still allows per-query settings and temporary tables, which
// `GLOBAL IN` needs. Only `query` is bound: writes go through `insert` and
// `command`, and must never be stopped halfway.

import type { ClickHouseSettings } from '@clickhouse/client';
import type { ClickHouseClient } from './context';

/** Read-only that still permits settings; `1` would reject every SETTINGS clause. */
const READ_ONLY_ALLOWING_SETTINGS = '2';

export const CANCEL_ON_CLIENT_CLOSE_SETTINGS: ClickHouseSettings = {
  readonly: READ_ONLY_ALLOWING_SETTINGS,
  cancel_http_readonly_queries_on_client_close: 1,
};

type QueryParams = Parameters<ClickHouseClient['query']>[0];

export function bindReadsToSignal(
  ch: ClickHouseClient,
  signal: AbortSignal
): ClickHouseClient {
  const query = (params: QueryParams) => {
    // Once abandoned, the remaining reads of the scope never leave the process.
    signal.throwIfAborted();
    return ch.query({
      ...params,
      abort_signal: signal,
      clickhouse_settings: {
        ...CANCEL_ON_CLIENT_CLOSE_SETTINGS,
        ...params.clickhouse_settings,
      },
    });
  };

  return new Proxy(ch, {
    get(target, property, receiver) {
      return property === 'query'
        ? query
        : Reflect.get(target, property, receiver);
    },
  });
}
