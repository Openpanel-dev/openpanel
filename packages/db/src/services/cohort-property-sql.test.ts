/**
 * SQL-shape tests for property-based cohort queries.
 *
 * Same strategy as chart-sql.test.ts / funnel-sql.test.ts: string assertions
 * always run; `EXPLAIN` validation runs against a locally reachable
 * ClickHouse (`pnpm dock:up`) and skips otherwise.
 */
import type { PropertyBasedCohortDefinition } from '@openpanel/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../prisma-client', () => ({
  db: {},
}));

import { ch } from '../clickhouse/client';
import {
  buildPropertyBasedCohortQuery,
  PROFILE_COHORT_QUERY_SETTINGS,
} from './cohort.service';

const PROJECT_ID = 'test-sql-validation';

let chReachable = false;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    chReachable = false;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!chReachable) {
      ctx.skip('ClickHouse not reachable at CLICKHOUSE_URL');
    }
    await fn();
  });

function buildSql(
  criteria: PropertyBasedCohortDefinition['criteria'],
  limit?: number,
) {
  return buildPropertyBasedCohortQuery(
    PROJECT_ID,
    { type: 'property', criteria } as PropertyBasedCohortDefinition,
    limit,
  );
}

const mapFilter = {
  id: 'a',
  name: 'profile.properties.experiment',
  operator: 'is' as const,
  value: ['control'],
};

describe('buildPropertyBasedCohortQuery', () => {
  it('resolves the newest row per profile without FINAL', () => {
    const sql = buildSql({ operator: 'and', properties: [mapFilter] });

    // FINAL cannot spill to disk, so wide projects OOM on the dedup itself.
    expect(sql).not.toContain('FINAL');
    expect(sql).toContain('GROUP BY id');
    expect(sql).toContain(
      "argMax(profiles.properties['experiment'], tuple(last_seen_at, tuple(profiles.properties['experiment'])))",
    );
  });

  it('orders every aggregate by ONE shared row key', () => {
    // Per-column tie-breaking lets equal-version rows with conflicting
    // fields each win a different column — an AND cohort could then match a
    // synthetic combination no stored row contains. The shared key makes
    // all aggregates read the same winning row.
    const sql = buildSql({
      operator: 'and',
      properties: [
        mapFilter,
        {
          id: 'b',
          name: 'profile.email',
          operator: 'is' as const,
          value: ['x@y.z'],
        },
      ],
    });

    const sharedKey =
      "tuple(last_seen_at, tuple(profiles.properties['experiment'], profiles.email))";
    expect(sql).toContain(
      `argMax(profiles.properties['experiment'], ${sharedKey})`,
    );
    expect(sql).toContain(`argMax(profiles.email, ${sharedKey})`);
  });

  it('filters aggregates in HAVING, not WHERE', () => {
    const sql = buildSql({ operator: 'and', properties: [mapFilter] });

    const having = sql.indexOf('HAVING');
    expect(having).toBeGreaterThan(-1);
    expect(sql.indexOf('argMax')).toBeGreaterThan(having);
  });

  it('wraps plain columns too, so mixed cohorts stay on one scan', () => {
    const sql = buildSql({
      operator: 'or',
      properties: [
        mapFilter,
        {
          id: 'b',
          name: 'profile.email',
          operator: 'contains' as const,
          value: ['@example.com'],
        },
      ],
    });

    expect(sql).toContain('argMax(profiles.email, tuple(last_seen_at,');
    expect(sql).toContain(' OR ');
    expect(sql).not.toContain('FINAL');
  });

  it('wraps numeric comparisons inside the cast', () => {
    const sql = buildSql({
      operator: 'and',
      properties: [
        {
          id: 'n',
          name: 'profile.properties.age',
          operator: 'gt' as const,
          value: ['30'],
        },
      ],
    });

    expect(sql).toContain(
      "toFloat64OrNull(argMax(profiles.properties['age'], tuple(last_seen_at,",
    );
  });

  it('escapes quotes in user-controlled property keys', () => {
    const sql = buildSql({
      operator: 'and',
      properties: [
        {
          id: 'q',
          name: "profile.properties.pl'an",
          operator: 'is' as const,
          value: ['x'],
        },
      ],
    });

    // The raw quote must never appear inside the literal unescaped.
    expect(sql).toContain("profiles.properties['pl\\'an']");
    expect(sql).not.toContain("properties['pl'an']");
  });

  it('applies the limit', () => {
    const sql = buildSql({ operator: 'and', properties: [mapFilter] }, 10);
    expect(sql).toContain('LIMIT 10');
  });

  it('matches nothing when every filter was dropped as empty', () => {
    const sql = buildSql({
      operator: 'and',
      properties: [
        {
          id: 'a',
          name: 'profile.properties.x',
          operator: 'is' as const,
          value: [],
        },
      ],
    });

    expect(sql).toContain('WHERE 1=0');
    expect(sql).not.toContain('argMax');
  });

  it('keeps the spill threshold below the hard memory limit', () => {
    // A GROUP BY only starts spilling once it crosses the threshold, so the
    // kill limit must sit above it — the inverted default is why these
    // queries OOM'd instead of spilling.
    const spill = Number(
      PROFILE_COHORT_QUERY_SETTINGS.max_bytes_before_external_group_by,
    );
    const limit = Number(PROFILE_COHORT_QUERY_SETTINGS.max_memory_usage);
    expect(spill).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(spill);
  });

  itCH('parses and resolves against ClickHouse', async () => {
    for (const sql of [
      buildSql({ operator: 'and', properties: [mapFilter] }, 10),
      buildSql({
        operator: 'or',
        properties: [
          mapFilter,
          {
            id: 'n',
            name: 'profile.properties.age',
            operator: 'gte' as const,
            value: ['30'],
          },
          {
            id: 'e',
            name: 'profile.email',
            operator: 'isNotNull' as const,
            value: [],
          },
        ],
      }),
    ]) {
      await ch.command({ query: `EXPLAIN ${sql}` });
    }
  });
});
