// The overview module's one ClickHouse entry point.
//
// The client is `deps.ch` — the same round-robin/retry proxy `main.ts` builds
// and hands to every scope — instead of a lazy
// `import('@openpanel/db/src/clickhouse/client')`. `OverviewService` /
// `PagesService` were classes carrying a caller-supplied client precisely
// because there was no scope to reach one through; there is now, so both are
// factories over `ServiceDeps` and this file just forwards.
//
// `timezone` is mandatory here (every overview query sends one, several as a
// literal 'UTC') where the shared helper leaves it optional, which is why this
// wrapper is worth keeping over calling `chQuery` directly.

import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import { chQuery } from '../../../ch-query';
import type { ServiceDeps } from '../../../services';

export function runQuery<T extends object>(
  deps: ServiceDeps,
  statement: SqlFragment,
  timezone: string
): Promise<T[]> {
  return chQuery<T>(deps, statement, { session_timezone: timezone });
}
