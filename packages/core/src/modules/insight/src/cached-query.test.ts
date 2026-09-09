// The cache-key contract of the wrapper that replaced `cached-clix.ts`.
//
// The clix wrapper keyed on `sha256(toSQL() + '|' + timezone)`, which was only
// sound because clix inlined every value into the text it hashed. The `sql`
// tag names its placeholders `{p1}, {p2}, …` from a per-render counter, so two
// statements that differ only in their bound values render to the SAME text —
// the second test below is the regression that a text-only key would fail.
//
// No module mock: `chQuery` is a thin wrapper over `deps.ch.query`, so a fake
// client counts the round trips and shows what was actually sent.

import { expect, test } from 'bun:test';
import { sql } from '@openpanel/db/src/clickhouse/sql';
import type { ChScope } from '../../../ch-query';
import { createStatementCache } from './cached-query';

function fakeDeps(
  rowsFor: (query_params: Record<string, unknown>) => object[]
) {
  const calls: {
    query: string;
    query_params?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }[] = [];
  const deps = {
    ch: {
      query: async ({ query, query_params, clickhouse_settings }: any) => {
        calls.push({ query, query_params, settings: clickhouse_settings });
        return {
          json: async () => ({
            data: rowsFor(query_params ?? {}),
            meta: [{ name: 'c', type: 'String' }],
            rows: 1,
          }),
        };
      },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  } as unknown as ChScope;
  return { deps, calls };
}

const countFor = (projectId: string) =>
  sql`SELECT count() AS c FROM sessions WHERE project_id = ${sql.string(projectId)}`;

test('an identical statement runs once per module/window context', async () => {
  const { deps, calls } = fakeDeps(() => [{ c: '1' }]);
  const run = createStatementCache(deps, new Map());

  const first = await run(countFor('alpha'));
  const second = await run(countFor('alpha'));

  expect(calls).toHaveLength(1);
  expect(second).toEqual(first);
});

test('equal text with different params is a different key', async () => {
  const alpha = countFor('alpha');
  const beta = countFor('beta');
  // The premise: a key over the rendered text alone would collide here.
  expect(beta.toStatement().query).toBe(alpha.toStatement().query);
  expect(beta.toStatement().query_params).not.toEqual(
    alpha.toStatement().query_params
  );

  const { deps, calls } = fakeDeps((params) => [{ c: params.p1 }]);
  const run = createStatementCache(deps, new Map());

  expect(await run(alpha)).toEqual([{ c: 'alpha' }]);
  expect(await run(beta)).toEqual([{ c: 'beta' }]);
  expect(calls).toHaveLength(2);
});

test('without a cache every call reaches ClickHouse', async () => {
  const { deps, calls } = fakeDeps(() => [{ c: '1' }]);
  const run = createStatementCache(deps);

  await run(countFor('alpha'));
  await run(countFor('alpha'));

  expect(calls).toHaveLength(2);
});

test('the timezone defaults to UTC, travels as session_timezone, and keys', async () => {
  const { deps, calls } = fakeDeps(() => [{ c: '1' }]);
  const shared = new Map<string, unknown>();

  await createStatementCache(deps, shared)(countFor('alpha'));
  expect(calls[0]?.settings).toEqual({ session_timezone: 'UTC' });

  await createStatementCache(
    deps,
    shared,
    'Europe/Stockholm'
  )(countFor('alpha'));
  expect(calls).toHaveLength(2);
  expect(calls[1]?.settings).toEqual({ session_timezone: 'Europe/Stockholm' });
});

test('the bound params reach ClickHouse, never the query text', async () => {
  const { deps, calls } = fakeDeps(() => [{ c: '1' }]);
  const run = createStatementCache(deps, new Map());

  await run(countFor("o'brien"));

  expect(calls[0]?.query).toContain('{p1:String}');
  expect(calls[0]?.query).not.toContain("o'brien");
  expect(calls[0]?.query_params).toEqual({ p1: "o'brien" });
});
