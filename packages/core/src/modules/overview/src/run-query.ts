// The overview module's one ClickHouse entry point; the client is `deps.ch`.
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
