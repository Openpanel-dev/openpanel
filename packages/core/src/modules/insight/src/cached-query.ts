// M12-007: the replacement for `cached-clix.ts` (ADR-013 decision 21).
//
// The wrapper it replaces memoised `clix`'s `execute()` on
// `sha256(query.toSQL() + '|' + timezone)` — safe only because clix inlined
// every value into the text it hashed. The `sql` tag renders `{pN:Type}`
// placeholders whose names come from a per-render counter, so two statements
// that differ only in their bound values render to the SAME text: the key must
// carry the params as well, or one project's window would serve another's.
//
// Everything else is deliberately unchanged from the clix wrapper: the `Map`
// belongs to the caller (per module+window, never module-level — it is keyed by
// nothing tenant-scoped), the timezone defaults to `'UTC'` exactly as
// `clix(client, timezone)` did (query-builder.ts:696) and travels as
// `session_timezone` in `clickhouse_settings` exactly as `.execute()` sent it
// (query-builder.ts:562).

import crypto from 'node:crypto';
import type { ClickHouseSettings } from '@clickhouse/client';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { type ChScope, chQuery } from '../../../shared/ch-query';

/** clix's own default when a call site passed no timezone. */
const DEFAULT_SESSION_TIMEZONE = 'UTC';

/** Runs one bound statement, memoised per module+window context. */
export type StatementRunner = <T extends object>(
  statement: SqlFragment
) => Promise<T[]>;

/**
 * @param deps  the scope's ClickHouse client + logger (so the requestId reaches
 *              the query — ADR-018).
 * @param cache per module+window result cache; omit to disable memoisation.
 * @param timezone `session_timezone` for every statement run through it.
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
