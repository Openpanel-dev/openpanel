/**
 * SQL-shape tests for the chart statements. Ported from
 * packages/db/src/services/chart-sql.test.ts (M7-003); the overview
 * `getRawWhereClause` cases stayed there with their subject.
 *
 * Strategy: render the statement, then run `EXPLAIN <sql>` with its bound
 * params against the isolated `openpanel_test` ClickHouse (pinned by
 * test/preload.ts). EXPLAIN parses, resolves columns and builds the plan
 * without executing, so UNKNOWN_IDENTIFIER / AMBIGUOUS_IDENTIFIER / bad JOIN
 * ON expressions surface without seeded data. WITH FILL TO < FROM is a
 * runtime check, so it is covered by a plain string assertion instead.
 *
 * Text assertions look at the rendered `query`; chart-level values are
 * `{pN:Type}` placeholders there, filter/breakdown expressions are the
 * verbatim V1 text (see field-resolution.ts's header).
 *
 * The statements' only Postgres read (the project's cohorts, for the
 * all-cohorts breakdown) is stubbed to "no cohorts": that is the precondition
 * the all-cohorts cases assert on, and it keeps this file independent of
 * whichever partial `prisma-client` mock a module-root service test left
 * behind (bun runs every file in one shared registry without `--isolate`).
 * The real Postgres cohort path runs in ../chart.service.test.ts.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type { IChartBreakdown, IChartEvent } from '@openpanel/validation';
import type { AggregateChartSqlInput, ChartSqlInput } from './chart-statement';

const cohortFindMany = mock(async () => []);
// Plain-object snapshot, not the live binding — restoring from the namespace
// import in afterAll would just re-apply the mock (see cohort.service.test.ts).
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
const realPrismaClient = { ...actualPrismaClient };
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...realPrismaClient,
  db: { cohort: { findMany: cohortFindMany } },
}));

afterAll(() => {
  mock.module('@openpanel/db/src/prisma-client', () => realPrismaClient);
});

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let deps: import('../../../services').ServiceDeps;
let buildChartSql: typeof import('./chart-statement').getChartSql;
let buildAggregateChartSql: typeof import('./chart-statement').getAggregateChartSql;

// IGetChartDataInput has display-only fields (metric, chartType, previous,
// etc.) that the SQL builders ignore; loosen the input type here.
type LooseChartInput = Partial<ChartSqlInput> &
  Pick<ChartSqlInput, 'event' | 'projectId' | 'timezone'>;
type LooseAggregateInput = Partial<AggregateChartSqlInput> &
  Pick<AggregateChartSqlInput, 'event' | 'projectId' | 'timezone'>;

async function getChartSql(input: LooseChartInput) {
  return render(await buildChartSql(deps, input as ChartSqlInput));
}

async function getAggregateChartSql(input: LooseAggregateInput) {
  return render(
    await buildAggregateChartSql(deps, input as AggregateChartSqlInput)
  );
}

interface Rendered {
  sql: string;
  params: Record<string, unknown>;
}

function render(fragment: SqlFragment): Rendered {
  const { query, query_params } = fragment.toStatement();
  return { sql: query, params: query_params };
}

async function explain({ sql, params }: Rendered): Promise<void> {
  await ch.command({ query: `EXPLAIN ${sql}`, query_params: params });
}

const PROJECT_ID = 'test-sql-validation';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';

const event = (overrides: Partial<IChartEvent> = {}): IChartEvent => ({
  id: 'A',
  name: 'screen_view',
  segment: 'event',
  filters: [],
  ...overrides,
});

const breakdown = (name: string): IChartBreakdown => ({ id: name, name });

const base = {
  interval: 'day' as const,
  startDate: START,
  endDate: END,
  projectId: PROJECT_ID,
  timezone: 'UTC',
};

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  const { testServiceDeps } = await import('../../../../test/service-deps');
  deps = await testServiceDeps();
  ({
    getChartSql: buildChartSql,
    getAggregateChartSql: buildAggregateChartSql,
  } = await import('./chart-statement'));
  // EXPLAIN needs the openpanel_test schema to resolve columns against.
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
}, 30_000);

describe('getChartSql', () => {
  it('qualifies properties[...] with `e.` when group join is present (fixes AMBIGUOUS_IDENTIFIER)', async () => {
    const rendered = await getChartSql({
      event: event({
        segment: 'session',
        filters: [
          { name: 'group.plan', operator: 'is', value: ['pro'] },
          {
            name: 'properties.__query.utm_source',
            operator: 'is',
            value: ['awn'],
          },
        ],
      }),
      breakdowns: [
        breakdown('country'),
        breakdown('properties.__query.utm_source'),
      ],
      ...base,
    });

    // Every map access on the events table must be aliased — the `_g` join
    // also exposes a `properties` column, so the bare form is ambiguous.
    expect(rendered.sql).not.toMatch(/(?<![._\w])properties\[/);
    expect(rendered.sql).toContain("e.properties['__query.utm_source']");

    await explain(rendered);
  });

  it('works without group join (qualified form is still valid when alone)', async () => {
    await explain(
      await getChartSql({
        event: event({
          filters: [
            {
              name: 'properties.__query.utm_source',
              operator: 'is',
              value: ['awn'],
            },
          ],
        }),
        breakdowns: [breakdown('properties.__query.utm_source')],
        ...base,
      })
    );
  });

  it('drops the all-cohorts breakdown when the project has 0 cohorts', async () => {
    cohortFindMany.mockClear();
    const rendered = await getChartSql({
      event: event({ segment: 'user' }),
      breakdowns: [breakdown('cohort')],
      ...base,
    });

    expect(cohortFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } })
    );
    // The all-cohorts JOIN expanded to `_uc._uc_label_X = 'Unknown'`, a
    // constant predicate with no join key — CH rejects it. The fix is to
    // remove the breakdown entirely when there are no cohorts.
    expect(rendered.sql).not.toMatch(/_uc_label_\d+\s*=\s*'Unknown'/);
    expect(rendered.sql).not.toContain('_all_cohorts');

    await explain(rendered);
  });

  it('skips WITH FILL when endDate < startDate', async () => {
    const rendered = await getChartSql({
      event: event(),
      breakdowns: [],
      ...base,
      startDate: END, // inverted
      endDate: START,
    });

    expect(rendered.sql).not.toContain('WITH FILL');
    await explain(rendered);
  });

  it('skips WITH FILL when endDate equals startDate inverted (week)', async () => {
    const rendered = await getChartSql({
      event: event(),
      breakdowns: [],
      ...base,
      interval: 'week',
      startDate: END,
      endDate: START,
    });
    expect(rendered.sql).not.toContain('WITH FILL');
  });

  it('emits WITH FILL when the range is valid', async () => {
    const rendered = await getChartSql({
      event: event(),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain('WITH FILL');
    await explain(rendered);
  });

  it('property metric (property_sum) with group join is unambiguous', async () => {
    const rendered = await getChartSql({
      event: event({
        segment: 'property_sum',
        property: 'properties.revenue_amount',
        filters: [{ name: 'group.plan', operator: 'is', value: ['pro'] }],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain("e.properties['revenue_amount']");
    await explain(rendered);
  });

  // Filter value type casting (filter.type). A date property compared with
  // `gte` used to crash with `toFloat64('2019-01-01')`; declaring the type
  // routes both column and value through the matching ClickHouse cast.
  it('date-typed gte filter casts via best-effort toDate, not toFloat64', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [
          {
            name: 'properties.cook',
            operator: 'gte',
            value: ['2019-01-01'],
            type: 'date',
          },
        ],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain('toDate(parseDateTimeBestEffortOrNull');
    expect(rendered.sql).not.toContain('toFloat64');
    await explain(rendered);
  });

  it('number-typed gte filter casts via toFloat64OrNull', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [
          {
            name: 'properties.age',
            operator: 'gte',
            value: ['5'],
            type: 'number',
          },
        ],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain('toFloat64OrNull');
    await explain(rendered);
  });

  it('untyped gte filter keeps legacy toFloat64 casting', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [{ name: 'properties.age', operator: 'gte', value: ['5'] }],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain('toFloat64OrZero');
    await explain(rendered);
  });

  it('one_event_per_user segment still parses', async () => {
    await explain(
      await getChartSql({
        event: event({ segment: 'one_event_per_user' }),
        breakdowns: [],
        ...base,
      })
    );
  });

  // Regressions from HyperDX 2026-05-14 → 2026-05-17 ClickHouse error log.
  // Saved reports / older clients send field names that don't match the events
  // schema; the chart service used to inline them verbatim, crashing parse.
  it('normalizes camelCase filter alias (referrerName → referrer_name)', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [{ name: 'referrerName', operator: 'is', value: ['email'] }],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain('referrer_name');
    expect(rendered.sql).not.toMatch(/(?<![._\w])referrerName/);
    await explain(rendered);
  });

  it('routes bare utm_source filter through properties map', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [{ name: 'utm_source', operator: 'is', value: ['awn'] }],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).toContain("properties['__query.utm_source']");
    // The unqualified `utm_source = …` form would fail with UNKNOWN_IDENTIFIER.
    expect(rendered.sql).not.toMatch(/(?<![._\w])utm_source\s*=/);
    await explain(rendered);
  });

  it('drops unknown breakdown rather than emitting invalid identifier', async () => {
    // `temple_name` is a custom property (lives in properties map) but got
    // saved as a top-level breakdown. The old code path emitted
    // `SELECT temple_name as _uc_label_1 FROM events`, failing parse.
    const rendered = await getChartSql({
      event: event(),
      breakdowns: [breakdown('temple_name')],
      ...base,
    });
    expect(rendered.sql).not.toMatch(/(?<![._\w])temple_name/);
    expect(rendered.sql).not.toContain('_uc_label_1');
    await explain(rendered);
  });

  it('drops unknown filter rather than emitting invalid identifier', async () => {
    const rendered = await getChartSql({
      event: event({
        filters: [
          { name: 'totally_made_up_column', operator: 'is', value: ['x'] },
        ],
      }),
      breakdowns: [],
      ...base,
    });
    expect(rendered.sql).not.toMatch(/totally_made_up_column/);
    await explain(rendered);
  });

  it('binds the chart-level values as parameters, never as literals', async () => {
    const rendered = await getChartSql({
      event: event({ name: "it's a 'quoted' name" }),
      breakdowns: [],
      ...base,
      projectId: "proj'ect",
    });
    expect(rendered.sql).not.toContain("proj'ect");
    expect(rendered.sql).not.toContain("'quoted'");
    expect(Object.values(rendered.params)).toContain("proj'ect");
    expect(Object.values(rendered.params)).toContain("it's a 'quoted' name");
    await explain(rendered);
  });
});

describe('getAggregateChartSql', () => {
  it('drops all-cohorts breakdown on empty cohort project', async () => {
    cohortFindMany.mockClear();
    const rendered = await getAggregateChartSql({
      event: event({ segment: 'user' }),
      breakdowns: [breakdown('cohort')],
      ...base,
    });
    expect(cohortFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } })
    );
    expect(rendered.sql).not.toMatch(/_uc_label_\d+\s*=\s*'Unknown'/);
    expect(rendered.sql).not.toContain('_all_cohorts');
    await explain(rendered);
  });

  it('properties + group breakdown is unambiguous', async () => {
    const rendered = await getAggregateChartSql({
      event: event({
        filters: [{ name: 'group.plan', operator: 'is', value: ['pro'] }],
      }),
      breakdowns: [breakdown('properties.__query.utm_source')],
      ...base,
    });
    expect(rendered.sql).toContain("e.properties['__query.utm_source']");
    await explain(rendered);
  });
});

describe('profile-property narrowing', () => {
  const profileFilter = {
    id: 'f1',
    name: 'profile.properties.plan',
    operator: 'is' as const,
    value: ['pro'],
  };

  it('projects only the referenced keys as scalar columns in the profile CTE', async () => {
    const { sql } = await getChartSql({
      event: event({ filters: [profileFilter] }),
      breakdowns: [breakdown('profile.properties.experiment')],
      ...base,
    });

    // The CTE selects one scalar column per referenced key...
    expect(sql).toContain("properties['plan'] as `profile.properties.plan`");
    expect(sql).toContain(
      "properties['experiment'] as `profile.properties.experiment`"
    );
    // ...instead of every profile's whole Map...
    expect(sql).not.toContain('properties as "profile.properties"');
    // ...and every ref in the query is rewritten to the scalar alias.
    expect(sql).not.toContain("profile.properties['plan']");
    expect(sql).not.toContain("profile.properties['experiment']");
  });

  it('falls back to the full Map for wildcard refs', async () => {
    const { sql } = await getChartSql({
      event: event({
        filters: [
          {
            id: 'f1',
            name: 'profile.properties.experiments.*.name',
            operator: 'is' as const,
            value: ['a'],
          },
        ],
      }),
      breakdowns: [],
      ...base,
    });

    // mapExtractKeyLike needs the whole Map, so it must stay selected.
    expect(sql).toContain('properties as "profile.properties"');
  });

  it('never narrows identifier-unsafe keys (backtick falls back to the Map)', async () => {
    const { sql } = await getChartSql({
      event: event({
        filters: [
          {
            id: 'f1',
            name: 'profile.properties.plan`tier',
            operator: 'is' as const,
            value: ['a'],
          },
        ],
      }),
      breakdowns: [],
      ...base,
    });

    // The unsafe key keeps its original Map access against the full Map —
    // it must never be embedded in a backtick-quoted alias.
    expect(sql).toContain('properties as "profile.properties"');
    expect(sql).not.toContain('as `profile.properties.plan`tier`');
  });

  it('collects the math-metric property too', async () => {
    const { sql } = await getChartSql({
      event: event({
        segment: 'property_average',
        property: 'profile.properties.age',
        filters: [profileFilter],
      }),
      breakdowns: [],
      ...base,
    });

    // The metric's key must be narrowed alongside the filter's — otherwise
    // the metric keeps reading the Map that narrowing just removed.
    expect(sql).toContain("properties['age'] as `profile.properties.age`");
    expect(sql).not.toContain("profile.properties['age']");
  });

  it('creates the profile join for a metric-only profile property', async () => {
    // No profile filter or breakdown — the metric alone must still create
    // the CTE and join, or its scalar alias resolves against nothing.
    const { sql } = await getChartSql({
      event: event({
        segment: 'property_average',
        property: 'profile.properties.age',
        filters: [],
      }),
      breakdowns: [],
      ...base,
    });

    expect(sql).toContain('LEFT ANY JOIN profile ON profile.id = profile_id');
    expect(sql).toContain("properties['age'] as `profile.properties.age`");
  });

  it('metric-only profile property parses and resolves', async () => {
    await explain(
      await getChartSql({
        event: event({
          segment: 'property_average',
          property: 'profile.properties.age',
          filters: [],
        }),
        breakdowns: [],
        ...base,
      })
    );
  });

  it('math metric on a narrowed profile property parses and resolves', async () => {
    await explain(
      await getChartSql({
        event: event({
          segment: 'property_average',
          property: 'profile.properties.age',
          filters: [profileFilter],
        }),
        breakdowns: [],
        ...base,
      })
    );
  });

  it('narrowed chart SQL parses and resolves', async () => {
    await explain(
      await getChartSql({
        event: event({ filters: [profileFilter] }),
        breakdowns: [breakdown('profile.properties.experiment')],
        ...base,
      })
    );
  });

  it('narrowed aggregate chart SQL parses and resolves', async () => {
    const rendered = await getAggregateChartSql({
      event: event({ filters: [profileFilter] }),
      breakdowns: [breakdown('profile.properties.experiment')],
      ...base,
    });
    expect(rendered.sql).not.toContain("profile.properties['plan']");
    await explain(rendered);
  });
});

describe('single-pass total_count', () => {
  it('scans events exactly once and merges uniq states globally (no breakdown)', async () => {
    const { sql } = await getChartSql({
      event: event(),
      breakdowns: [],
      ...base,
    });
    expect(sql).not.toContain('_uc AS (');
    expect(sql).toContain('uniqState(profile_id) as _uc_state');
    expect(sql).toContain('uniqMerge(_uc_state) OVER () as total_count');
    expect(sql).toContain('* EXCEPT (_uc_state)');
    // exactly one scan of the events table
    expect(sql.match(/FROM events e/g)).toHaveLength(1);
  });

  it('partitions the merged uniq states by breakdown labels', async () => {
    const { sql } = await getChartSql({
      event: event(),
      breakdowns: [breakdown('properties.experiment')],
      ...base,
    });
    expect(sql).not.toContain('_uc AS (');
    expect(sql).not.toContain('LEFT ANY JOIN _uc');
    expect(sql).toContain(
      'uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count'
    );
    expect(sql.match(/FROM events e/g)).toHaveLength(1);
  });

  it('keeps ORDER BY and WITH FILL outside the aggregation subquery', async () => {
    const { sql } = await getChartSql({
      event: event(),
      breakdowns: [],
      ...base,
    });
    // GROUP BY belongs to the inner scan; ORDER BY/FILL follow its closing paren
    expect(sql).toMatch(/GROUP BY[^)]*\)\s*ORDER BY date ASC/);
    expect(sql).toContain('WITH FILL');
  });

  it('single-pass chart SQL parses and resolves (no breakdown)', async () => {
    await explain(
      await getChartSql({ event: event(), breakdowns: [], ...base })
    );
  });

  it('single-pass chart SQL parses and resolves (breakdown + cohort + profile)', async () => {
    await explain(
      await getChartSql({
        event: event({
          filters: [
            {
              id: 'f1',
              name: 'profile.properties.plan',
              operator: 'is' as const,
              value: ['pro'],
            },
          ],
        }),
        breakdowns: [breakdown('properties.experiment')],
        ...base,
      })
    );
  });
});
