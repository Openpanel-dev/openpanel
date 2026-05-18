import type { ClickHouseClient } from '@clickhouse/client';
import { describe, expect, it } from 'vitest';
import { clix } from './query-builder';

const fakeClient = {} as ClickHouseClient;

const buildWhereSQL = (column: string, op: any, value: any) =>
  clix(fakeClient)
    .select(['*'])
    .from('events')
    .where(column, op, value)
    .toSQL();

describe('query-builder escapeValue', () => {
  it('fully escapes user paths that contain a date substring', () => {
    const sql = buildWhereSQL(
      'e.path',
      '=',
      '/blog/2024-03-17-supabase-activity-scheduler',
    );

    expect(sql).toContain(
      "e.path = '/blog/2024-03-17-supabase-activity-scheduler'",
    );
    // Make sure the date is NOT quoted independently (the original bug).
    expect(sql).not.toContain("/blog/'2024-03-17'");
  });

  it('does not allow SQL injection via a date-substring payload', () => {
    const sql = buildWhereSQL(
      'e.path',
      '=',
      "/blog/2024-01-01' OR '1'='1",
    );

    // Single quotes in the value must be escaped, not break out of the string.
    expect(sql).toContain(
      "e.path = '/blog/2024-01-01\\' OR \\'1\\'=\\'1'",
    );
    expect(sql).not.toMatch(/OR '1'='1[^']/);
  });

  it('escapes a plain ISO date string', () => {
    const sql = buildWhereSQL('e.created_at', '=', '2026-04-29 00:00:00');
    expect(sql).toContain("e.created_at = '2026-04-29 00:00:00'");
  });

  it('keeps clix.datetime(date, "toDateTime") as a SQL fragment with the date quoted', () => {
    const sql = buildWhereSQL(
      'e.created_at',
      '=',
      clix.datetime('2026-04-29T00:00:00.000Z', 'toDateTime'),
    );
    expect(sql).toContain("e.created_at = toDateTime('2026-04-29 00:00:00')");
  });

  it('handles BETWEEN with clix.datetime wrapped values', () => {
    const sql = clix(fakeClient)
      .select(['*'])
      .from('events')
      .where('e.created_at', 'BETWEEN', [
        clix.datetime('2026-04-29T00:00:00.000Z', 'toDateTime'),
        clix.datetime('2026-05-07T00:00:00.000Z', 'toDateTime'),
      ])
      .toSQL();

    expect(sql).toContain(
      "e.created_at BETWEEN toDateTime('2026-04-29 00:00:00') AND toDateTime('2026-05-07 00:00:00')",
    );
  });

  it('escapes Date objects as datetime literals', () => {
    const sql = buildWhereSQL(
      'e.created_at',
      '=',
      new Date('2026-04-29T00:00:00.000Z'),
    );
    expect(sql).toContain("e.created_at = '2026-04-29 00:00:00'");
  });

  it('does not treat an arbitrary string with embedded date as raw SQL', () => {
    // Function-call-like prefix but not a real wrapper — ensures we don't
    // accidentally promote arbitrary text to raw SQL.
    const sql = buildWhereSQL('e.path', '=', 'event-2026-04-15-launch');
    expect(sql).toContain("e.path = 'event-2026-04-15-launch'");
    expect(sql).not.toContain("'2026-04-15'");
  });
});
