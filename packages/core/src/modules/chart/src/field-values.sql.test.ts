// Same strategy as ./sql.test.ts: render, then EXPLAIN against the isolated
// openpanel_test schema so a column that exists on `events` but not on
// `sessions` (or vice versa) fails here, not in production.

import { beforeAll, describe, expect, it } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let eventFieldValuesQuery: typeof import('./field-values.sql').eventFieldValuesQuery;
let getSelectPropertyKey: typeof import('./field-resolution').getSelectPropertyKey;

const PROJECT_ID = 'test-field-values';

function render(fragment: SqlFragment) {
  const { query, query_params } = fragment.toStatement();
  return { sql: query, params: query_params };
}

async function explain(fragment: SqlFragment): Promise<string> {
  const { sql, params } = render(fragment);
  await ch.command({ query: `EXPLAIN ${sql}`, query_params: params });
  return sql;
}

function query(event: string, column: string, lookbackDays?: number) {
  return eventFieldValuesQuery({
    projectId: PROJECT_ID,
    column,
    selectExpression: getSelectPropertyKey(column),
    event,
    lookbackDays,
  });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  ({ eventFieldValuesQuery } = await import('./field-values.sql'));
  ({ getSelectPropertyKey } = await import('./field-resolution'));
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
}, 30_000);

describe('eventFieldValuesQuery', () => {
  it('reads a session-level column for all events from `sessions`', async () => {
    const sql = await explain(query('*', 'country'));
    expect(sql).toContain('FROM sessions');
    expect(sql).not.toContain('name =');
  });

  it('stays on `events` for a specific event: `sessions` has no name column', async () => {
    const sql = await explain(query('screen_view', 'country'));
    expect(sql).toContain('FROM events');
    expect(sql).toContain('AND name = {');
  });

  it('stays on `events` for a per-pageview column', async () => {
    const sql = await explain(query('*', 'path'));
    expect(sql).toContain('FROM events');
  });

  it('clamps the lookback to a bound day count instead of a 6-month scan', () => {
    const { sql, params } = render(query('*', 'os'));
    expect(sql).toContain('toIntervalDay({p2:UInt32})');
    expect(params.p2).toBe(30);
    expect(sql).not.toContain('MONTH');
    expect(render(query('*', 'os', 7)).params.p2).toBe(7);
  });
});
