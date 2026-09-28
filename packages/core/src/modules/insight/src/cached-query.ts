// The critical invariant: the `sql` tag renders `{pN:Type}` placeholders whose
// names come from a per-render counter, so two statements that differ only in
// their bound values render to the SAME text. The cache key must therefore
// carry the params as well as the query text, or one project's window would
// serve another's.
//
// The `Map` belongs to the caller (per module+window, never module-level — it
// is keyed by nothing tenant-scoped); the timezone defaults to `'UTC'` and
// travels as `session_timezone` in `clickhouse_settings`.

import crypto from 'node:crypto';
import type { ClickHouseSettings } from '@clickhouse/client';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { type ChScope, chQuery } from '../../../ch-query';

/** Default timezone when the caller specifies none. */
const DEFAULT_SESSION_TIMEZONE = 'UTC';

/** Runs one bound statement, memoised per module+window context. */
export type StatementRunner = <T extends object>(
  statement: SqlFragment
) => Promise<T[]>;

/**
 * @param deps the scope's ClickHouse client + logger (so the requestId reaches
 * the query — ADR-018). @param cache per module+window result cache; omit to
 * disable memoisation. @param timezone `session_timezone` for every statement
 * run through it.
 */
export function createStatementCache(
  deps: ChScope,
  cache?: Map<string, unknown>,
  timezone?: string
): StatementRunner {
  const sessionTimezone = timezone ?? DEFAULT_SESSION_TIMEZONE;
  const settings: ClickHouseSettings = { session_timezone: sessionTimezone };

  return async <T extends object>(statement: SqlFragment): Promise<T[]> => {
    if (!cache) {
      return chQuery<T>(deps, statement, settings);
    }

    const { query, query_params } = statement.toStatement();
    // Param names are assigned in render order from one counter, so
    // `JSON.stringify` is stable for a given fragment and two fragments that
    // differ only in param ORDER are correctly different keys. Do not sort.
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${query}|${JSON.stringify(query_params)}|${sessionTimezone}`)
      .digest('hex');

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as T[];
    }

    const rows = await chQuery<T>(deps, statement, settings);
    cache.set(cacheKey, rows);
    return rows;
  };
}
