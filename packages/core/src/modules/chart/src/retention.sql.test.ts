/**
 * Shape tests for `retention.sql.ts`, same strategy as `overview.sql.test.ts`:
 * render the statement, then `EXPLAIN` it with its bound params against the
 * isolated `openpanel_test` ClickHouse (pinned by test/preload.ts), which
 * parses and resolves columns without executing.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

const PROJECT_ID = 'retention-sql-validation';

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let RET: typeof import('./retention.sql');

async function explain(fragment: SqlFragment): Promise<void> {
  const { query, query_params } = fragment.toStatement();
  await ch.command({ query: `EXPLAIN ${query}`, query_params });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  RET = await import('./retention.sql');
});

describe('rollingActiveUsersQuery', () => {
  // `date + n` smears every active day forward, so without an upper bound the
  // series runs up to `days - 1` days past today. On the seeded acme-web at
  // days=7 that drew two points into the future (ISSUES.md H8c).
  it('never projects past today', () => {
    for (const days of [1, 7, 30]) {
      const { query } = RET.rollingActiveUsersQuery(
        PROJECT_ID,
        days
      ).toStatement();
      expect(query).toContain('date <= today()');
    }
  });

  it('parses against ClickHouse', async () => {
    await explain(RET.rollingActiveUsersQuery(PROJECT_ID, 7));
  });
});
