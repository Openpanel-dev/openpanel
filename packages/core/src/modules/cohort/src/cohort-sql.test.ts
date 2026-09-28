// SQL-shape tests for property-based cohort queries. Minus its itCH
// ClickHouse-reachability EXPLAIN check: `mock.module` substitutions apply
// process-wide, not per file, so a sibling file's
// `@openpanel/db/src/clickhouse/client` mock (cohort.service.test.ts) can
// silently replace this file's "real" import too, making a reachability check
// meaningless. No module in core's suite ports that pattern for the same
// reason; the generated SQL was verified against local ClickHouse by hand
// instead (see the M5-003 task summary).
//
// String assertions need no mocking at all: cohort.service.ts's db/ch access is
// lazy, and buildPropertyBasedCohortQuery / deriveCohortQuerySettings touch
// neither — see cohort.service.ts's header.
//
// The builders return `SqlFragment`s now, so every assertion below runs against
// the RENDERED statement plus its bound params rather than a finished string.
// The assertions themselves are unchanged in what they claim, except the one
// about quotes in a user-controlled property key: a quote no longer needs
// escaping because the key is not in the SQL text at all, so that test asserts
// the binding instead.
//
// V1's `PROFILE_COHORT_QUERY_SETTINGS` test used `vi.resetModules` +
// `vi.stubEnv` to re-import the module under different env vars — the suite's
// only `vi.resetModules` site (ADR-010's tail table). bun:test shares one
// module registry per file even under `--isolate`, so re-importing would not
// re-evaluate a module-level const. `deriveCohortQuerySettings` exists so this
// ports as direct calls instead.

import { expect, test } from 'bun:test';
import {
  getReplicatedTableName,
  replicatedTarget,
} from '../../../shared/ch-tables';
import type { PropertyBasedCohortDefinition } from '../cohort.constants';
import {
  buildPropertyBasedCohortQuery,
  deriveCohortQuerySettings,
} from '../cohort.service';

const PROJECT_ID = 'test-sql-validation';

function buildStatement(
  criteria: PropertyBasedCohortDefinition['criteria'],
  limit?: number
) {
  return buildPropertyBasedCohortQuery(
    PROJECT_ID,
    { type: 'property', criteria } as PropertyBasedCohortDefinition,
    limit
  ).toStatement();
}

function buildSql(
  criteria: PropertyBasedCohortDefinition['criteria'],
  limit?: number
) {
  return buildStatement(criteria, limit).query;
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
    'argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}])))'
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

  // One shared key per aggregate: same columns, same order, both times.
  expect(sql).toContain(
    'argMax(profiles.properties[{p2:String}], tuple(last_seen_at, cityHash64(profiles.properties[{p3:String}], profiles.email)))'
  );
  expect(sql).toContain(
    'argMax(profiles.email, tuple(last_seen_at, cityHash64(profiles.properties[{p5:String}], profiles.email)))'
  );
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
    'toFloat64OrNull(argMax(profiles.properties[{p2:String}], tuple(last_seen_at,'
  );
});

test('binds user-controlled property keys instead of escaping them', () => {
  const { query, query_params } = buildStatement({
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

  // The key never reaches the SQL text, escaped or not — it is a bound param.
  expect(query).not.toContain("pl'an");
  expect(query).toContain('profiles.properties[{p2:String}]');
  expect(Object.values(query_params)).toContain("pl'an");
});

test('replicatedTarget renders exactly what getReplicatedTableName produces', () => {
  for (const clustered of [true, false]) {
    for (const table of ['cohort_members', 'cohort_metadata']) {
      expect(replicatedTarget(clustered, table).toStatement()).toEqual({
        query: getReplicatedTableName(clustered, table),
        query_params: {},
      });
    }
  }
});

test('applies the limit', () => {
  const { query, query_params } = buildStatement(
    { operator: 'and', properties: [mapFilter] },
    10
  );
  expect(query).toContain('LIMIT {p5:UInt64}');
  expect(query_params.p5).toBe(10);
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
      memoryLimitBytes: undefined,
      spillBytes: undefined,
    })
  ).toEqual({});
});

test('deriveCohortQuerySettings derives the spill threshold as limit/3 when only the limit is set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytes: 3_000_000_000,
      spillBytes: undefined,
    })
  ).toEqual({
    max_bytes_before_external_group_by: '1000000000',
    max_memory_usage: '3000000000',
  });
});

test('deriveCohortQuerySettings respects both values when both are set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytes: 2_000_000_000,
      spillBytes: 500_000_000,
    })
  ).toEqual({
    max_bytes_before_external_group_by: '500000000',
    max_memory_usage: '2000000000',
  });
});

test('deriveCohortQuerySettings applies only the spill threshold when only it is set', () => {
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytes: undefined,
      spillBytes: 500_000_000,
    })
  ).toEqual({ max_bytes_before_external_group_by: '500000000' });
});

test('deriveCohortQuerySettings re-derives an inverted pair (spill >= limit would never spill)', () => {
  // A GROUP BY only starts spilling once it crosses the threshold, so a
  // threshold at/above the kill limit means the query dies before it ever
  // writes to disk — the exact inversion ClickHouse Cloud ships.
  expect(
    deriveCohortQuerySettings({
      memoryLimitBytes: 900_000_000,
      spillBytes: 900_000_000,
    })
  ).toEqual({
    max_bytes_before_external_group_by: '300000000',
    max_memory_usage: '900000000',
  });
});

test('deriveCohortQuerySettings never derives a zero spill threshold (0 would DISABLE spilling)', () => {
  for (const memoryLimitBytes of [1, 2, 3]) {
    const settings = deriveCohortQuerySettings({
      memoryLimitBytes,
      spillBytes: undefined,
    });
    expect(
      Number(settings.max_bytes_before_external_group_by)
    ).toBeGreaterThanOrEqual(1);
  }
});

// A malformed COHORT_QUERY_* value is rejected by the config loader now, not
// here — `apps/api/src/config/env.test.ts` owns that case since M15-006.
