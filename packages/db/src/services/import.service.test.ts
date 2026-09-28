/**
 * SQL-shape test for the window-function session id query.
 *
 * Two events on the same device with an identical `created_at` need the same
 * tie-break order at every nested window (lagInFrame's previous-row lookup,
 * row_number's position, and the outer running sum) -- otherwise a row one
 * window places one way can land elsewhere in another, splitting or merging
 * a session inconsistently within a single run. This pins that every
 * `ORDER BY ... created_at` window carries `id` as that tie-breaker.
 *
 * A live comparison against a ClickHouse `values()` literal (no table
 * created) is the stronger check and is how this was verified during
 * development, matching the strategy other *-sql.test.ts files in this
 * package use for an `itCH`-gated live run -- but there is no ClickHouse
 * reachable in every environment this suite runs in, so this test asserts
 * the query shape instead of executing it.
 */
import { describe, expect, it, vi } from 'vitest';

const commandMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../clickhouse/client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../clickhouse/client')>();
  return {
    ...actual,
    ch: { command: commandMock },
  };
});

const { generateGapBasedSessionIds } = await import('./import.service');

describe('generateGapBasedSessionIds', () => {
  it('breaks ties on id in every created_at window', async () => {
    await generateGapBasedSessionIds('import-1');

    const insertCall = commandMock.mock.calls.find(([arg]) =>
      String(arg.query).includes('INSERT INTO')
    );
    expect(insertCall).toBeDefined();

    const sql = String(insertCall![0].query);
    const windowOrderBys = [
      ...sql.matchAll(/ORDER BY [^\n]*created_at[^\n)]*/g),
    ].map((match) => match[0]);

    expect(windowOrderBys.length).toBe(3);
    for (const clause of windowOrderBys) {
      expect(clause).toContain('created_at, id');
    }
  });
});
