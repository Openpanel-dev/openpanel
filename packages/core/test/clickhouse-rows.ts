// Row-level equivalence for a query rewrite: both statements run against the
// test ClickHouse and must produce the same rows, order ignored.

import { expect } from 'bun:test';
import type { ch as ChClient } from '@openpanel/db/src/clickhouse/client';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

type Ch = typeof ChClient;

function stableRow(row: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(row).sort(([left], [right]) => left.localeCompare(right))
    )
  );
}

/** Every row as a canonical string, sorted, so two result sets compare as sets. */
export async function fetchRows(
  ch: Ch,
  fragment: SqlFragment
): Promise<string[]> {
  const { query, query_params } = fragment.toStatement();
  const result = await ch.query({
    query,
    query_params,
    format: 'JSONEachRow',
    clickhouse_settings: { session_timezone: 'UTC' },
  });
  const rows = (await result.json()) as Record<string, unknown>[];
  return rows.map(stableRow).sort();
}

/**
 * `reference` is the statement being replaced (with `FINAL`), written out in
 * the test so it cannot drift with the code; `candidate` is what the module
 * builds now. `expectedCount` guards against both returning nothing.
 */
export async function expectSameRows(
  ch: Ch,
  reference: SqlFragment,
  candidate: SqlFragment,
  expectedCount: number
): Promise<string[]> {
  const [expected, actual] = await Promise.all([
    fetchRows(ch, reference),
    fetchRows(ch, candidate),
  ]);
  expect(expected).toHaveLength(expectedCount);
  expect(actual).toEqual(expected);
  return actual;
}
