// The one place the chart module reaches @openpanel/db's ClickHouse client.
//
// The import is lazy on purpose: the core barrel pulls this module into nearly
// every test file, and constructing @openpanel/db's clients at import time
// costs a pino-pretty worker per file.

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

export function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

/** `timezone` travels as `session_timezone`, exactly as clix sent it. */
export async function runQuery<T extends object>(
  statement: SqlFragment,
  timezone?: string
): Promise<T[]> {
  const { chQuery } = await loadChClient();
  return chQuery<T>(
    statement,
    timezone ? { session_timezone: timezone } : undefined
  );
}
