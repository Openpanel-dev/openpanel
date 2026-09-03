// SQL-shape tests for property-based cohort queries. Ported from
// packages/db/src/services/cohort-property-sql.test.ts (M5-003) — minus its
// itCH ClickHouse-reachability EXPLAIN check: `mock.module` substitutions
// apply process-wide, not per file, so a sibling file's
// `@openpanel/db/src/clickhouse/client` mock (cohort.service.test.ts) can
// silently replace this file's "real" import too, making a reachability
// check meaningless. No module in core's suite ports that pattern for the
// same reason; the generated SQL was verified against local ClickHouse by
// hand instead (see the M5-003 task summary).
//
// String assertions need no mocking at all: cohort.service.ts's db/ch access
// is lazy, and buildPropertyBasedCohortQuery / deriveCohortQuerySettings
// touch neither — see cohort.service.ts's header.
//
// V1's `PROFILE_COHORT_QUERY_SETTINGS` test used `vi.resetModules()` +
// `vi.stubEnv()` to re-import the module under different env vars — the
// suite's only `vi.resetModules` site (ADR-010's tail table). bun:test shares
// one module registry per file even under `--isolate`, so re-importing would
// not re-evaluate a module-level const. `deriveCohortQuerySettings` exists
// so this ports as direct calls instead.

import { expect, test } from 'bun:test';
import type { PropertyBasedCohortDefinition } from '../cohort.constants';
import {
  buildPropertyBasedCohortQuery,
  deriveCohortQuerySettings,
} from '../cohort.service';

const PROJECT_ID = 'test-sql-validation';

function buildSql(
  criteria: PropertyBasedCohortDefinition['criteria'],
  limit?: number
) {
  return buildPropertyBasedCohortQuery(
    PROJECT_ID,
    { type: 'property', criteria } as PropertyBasedCohortDefinition,
    limit
  );
}

const mapFilter = {
  id: 'a',
  name: 'profile.properties.experiment',
  operator: 'is' as const,
  value: ['control'],
};

test('resolves the newest row per profile without FINAL', () => {
  const sql = buildSql({ operator: 'and', properties: [mapFilter] });

  // FINAL cannot spill to disk, so wide projects OOM on the dedup itself.
  expect(sql).not.toContain('FINAL');
  expect(sql).toContain('GROUP BY id');
  expect(sql).toContain(
    "argMax(profiles.properties['experiment'], tuple(last_seen_at, cityHash64(profiles.properties['experiment'])))"
  );
});

test('orders every aggregate by ONE shared row key', () => {
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
    "tuple(last_seen_at, cityHash64(profiles.properties['experiment'], profiles.email))";
  expect(sql).toContain(
    `argMax(profiles.properties['experiment'], ${sharedKey})`
  );
  expect(sql).toContain(`argMax(profiles.email, ${sharedKey})`);
});

test('filters aggregates in HAVING, not WHERE', () => {
  const sql = buildSql({ operator: 'and', properties: [mapFilter] });

  const having = sql.indexOf('HAVING');
  expect(having).toBeGreaterThan(-1);
  expect(sql.indexOf('argMax')).toBeGreaterThan(having);
});

test('wraps plain columns too, so mixed cohorts stay on one scan', () => {
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

test('wraps numeric comparisons inside the cast', () => {
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
    "toFloat64OrNull(argMax(profiles.properties['age'], tuple(last_seen_at,"
  );
});

test('escapes quotes in user-controlled property keys', () => {
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

test('applies the limit', () => {
  const sql = buildSql({ operator: 'and', properties: [mapFilter] }, 10);
  expect(sql).toContain('LIMIT 10');
});

test('matches nothing when every filter was dropped as empty', () => {
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

test('deriveCohortQuerySettings applies NO settings when neither variable is set (upstream defaults govern)', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: undefined,
      spillBytesRaw: undefined,
    })
  ).toEqual({});
});

test('deriveCohortQuerySettings derives the spill threshold as limit/3 when only the limit is set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: '3000000000',
      spillBytesRaw: undefined,
    })
  ).toEqual({
    max_bytes_before_external_group_by: '1000000000',
    max_memory_usage: '3000000000',
  });
});

test('deriveCohortQuerySettings respects both values when both are set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: '2000000000',
      spillBytesRaw: '500000000',
    })
  ).toEqual({
    max_bytes_before_external_group_by: '500000000',
    max_memory_usage: '2000000000',
  });
});

test('deriveCohortQuerySettings applies only the spill threshold when only it is set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: undefined,
      spillBytesRaw: '500000000',
    })
  ).toEqual({ max_bytes_before_external_group_by: '500000000' });
});

test('deriveCohortQuerySettings re-derives an inverted pair (spill >= limit would never spill)', () => {
  // A GROUP BY only starts spilling once it crosses the threshold, so a
  // threshold at/above the kill limit means the query dies before it ever
  // writes to disk — the exact inversion ClickHouse Cloud ships.
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: '900000000',
      spillBytesRaw: '900000000',
    })
  ).toEqual({
    max_bytes_before_external_group_by: '300000000',
    max_memory_usage: '900000000',
  });
});

test('deriveCohortQuerySettings never derives a zero spill threshold (0 would DISABLE spilling)', () => {
  for (const memoryLimitBytesRaw of ['1', '2', '3']) {
    const settings = deriveCohortQuerySettings({
      memoryLimitBytesRaw,
      spillBytesRaw: undefined,
    });
    expect(
      Number(settings.max_bytes_before_external_group_by)
    ).toBeGreaterThanOrEqual(1);
  }
});

test('deriveCohortQuerySettings ignores malformed values', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytesRaw: '2gb',
      spillBytesRaw: '-1',
    })
  ).toEqual({});
});
