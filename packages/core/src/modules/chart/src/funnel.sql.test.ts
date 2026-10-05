/**
 * SQL-shape tests for the funnel statements: render, then `EXPLAIN <sql>` with the
 * bound params against the isolated `openpanel_test` ClickHouse (pinned by
 * test/preload.ts). EXPLAIN resolves columns without executing, so a breakdown
 * expression referencing a join alias that was never added fails here as
 * UNKNOWN_IDENTIFIER.
 *
 * Text assertions normalise placeholder NUMBERS away: a fragment reused in two
 * clauses renders `{p3:String}` in one and `{p11:String}` in the other, and the
 * property under test is that the same condition appears twice.
 *
 * The statements' only Postgres read (the breakdown's cohort names) is stubbed,
 * so this file is independent of whichever partial `prisma-client` mock a
 * module-root service test left behind.
 */

import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type {
  IChartBreakdown,
  IReportInput,
} from '../../report/report.constants';

const COHORT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const cohortFindMany = mock(async () => [
  { id: COHORT_ID, name: 'Power users' },
]);
// Plain-object snapshot, not the live binding — restoring from the namespace
// import in afterAll would just re-apply the mock.
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
const realPrismaClient = { ...actualPrismaClient };
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...realPrismaClient,
  db: { cohort: { findMany: cohortFindMany } },
}));

afterAll(async () => {
  mock.module('@openpanel/db/src/prisma-client', () => realPrismaClient);
});

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let buildFunnelBase: typeof import('../funnel.service').buildFunnelBase;
let funnelChartQuery: typeof import('./funnel.sql').funnelChartQuery;
let funnelProfilesQuery: typeof import('./funnel.sql').funnelProfilesQuery;
let funnelStepConditions: typeof import('./funnel.sql').funnelStepConditions;
let onlyReportEvents: typeof import('../../report/src/series').onlyReportEvents;
let deps: import('../../../services').ServiceDeps;

const PROJECT_ID = 'test-sql-validation';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';
const FUNNEL_WINDOW_HOURS = 24;
const PROFILES_LIMIT = 1000;
const TARGET_LEVEL = 2;

type ISeriesItem = IReportInput['series'][number];

const event = (overrides: Partial<ISeriesItem> = {}): ISeriesItem =>
  ({
    id: 'A',
    type: 'event',
    name: 'screen_view',
    segment: 'event',
    filters: [],
    ...overrides,
  }) as ISeriesItem;

const breakdown = (name: string): IChartBreakdown => ({ id: name, name });

const SERIES = [event({ id: 'A' }), event({ id: 'B', name: 'sign_up' })];

/** `{p12:String}` → `{p:String}`; slot numbering is not the contract. */
const PLACEHOLDER_NUMBER = /\{p\d+:/g;
function normalize(query: string): string {
  return query.replace(PLACEHOLDER_NUMBER, '{p:');
}

interface Rendered {
  sql: string;
  params: Record<string, unknown>;
  /**
   * `sql` with every placeholder substituted back to its literal value. The
   * field resolver binds `properties[<key>]` keys and cohort labels too, so
   * an assertion about the SHAPE of the expression reads this.
   */
  text: string;
}

const PLACEHOLDER = /\{(p\d+):[^}]+\}/g;

function literal(value: unknown): string {
  if (Array.isArray(value)) {
    return `(${value.map(literal).join(', ')})`;
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }
  return String(value);
}

function render(fragment: SqlFragment): Rendered {
  const { query, query_params } = fragment.toStatement();
  return {
    sql: normalize(query),
    params: query_params,
    text: query.replace(PLACEHOLDER, (_match, name: string) =>
      literal(query_params[name])
    ),
  };
}

async function explain(fragment: SqlFragment): Promise<void> {
  const { query, query_params } = fragment.toStatement();
  await ch.command({ query: `EXPLAIN ${query}`, query_params });
}

interface BaseOverrides {
  series?: ISeriesItem[];
  breakdowns?: IChartBreakdown[];
  funnelGroup?: string;
}

function baseInput(overrides: BaseOverrides = {}) {
  return {
    projectId: PROJECT_ID,
    startDate: START,
    endDate: END,
    series: overrides.series ?? SERIES,
    breakdowns: overrides.breakdowns ?? [],
    funnelWindow: FUNNEL_WINDOW_HOURS,
    funnelGroup: overrides.funnelGroup,
    timezone: 'UTC',
  };
}

/** Mirrors what getFunnelStepProfiles builds on top of the shared base. */
async function profilesStatement(overrides: BaseOverrides = {}) {
  const base = await buildFunnelBase(deps, baseInput(overrides));
  return funnelProfilesQuery(base, {
    targetLevel: TARGET_LEVEL,
    showDropoffs: false,
    breakdownValues: [],
    limit: PROFILES_LIMIT,
  });
}

/** Mirrors what the funnel chart builds on top of the shared base. */
async function chartStatement(overrides: BaseOverrides = {}) {
  const base = await buildFunnelBase(deps, baseInput(overrides));
  return funnelChartQuery(base);
}

const chartSql = async (breakdowns: IChartBreakdown[]) =>
  render(await chartStatement({ breakdowns })).sql;

const chartText = async (breakdowns: IChartBreakdown[]) =>
  render(await chartStatement({ breakdowns })).text;

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  ({ buildFunnelBase } = await import('../funnel.service'));
  ({ funnelChartQuery, funnelProfilesQuery, funnelStepConditions } =
    await import('./funnel.sql'));
  ({ onlyReportEvents } = await import('../../report/src/series'));
  const { testServiceDeps } = await import('../../../../test/service-deps');
  deps = await testServiceDeps();
});

describe('funnel.sql / buildFunnelBase — profile breakdowns', () => {
  it('adds the profiles join for a profile.properties breakdown', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown('profile.properties.plan')],
    });
    const { sql, text } = render(statement);

    // The breakdown is narrowed to a scalar alias selected by the profile
    // join, so both the join and the aliased column must exist.
    expect(text).toContain("properties['plan'] as `profile.properties.plan`");
    expect(sql).toMatch(/as profile/);
    expect(sql).toContain('profile.id = events.profile_id');
    await explain(statement);
  });

  it('selects the properties column, not a bare `properties` field', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown('profile.properties.plan')],
    });
    expect(render(statement).sql).toMatch(
      /SELECT [^)]*properties[^)]*FROM profiles/
    );
    await explain(statement);
  });

  it('adds the profiles join for a top-level profile breakdown', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown('profile.email')],
    });
    expect(render(statement).sql).toContain('profile.id = events.profile_id');
    await explain(statement);
  });

  it('adds the join for a profile filter with no profile breakdown', async () => {
    const statement = await profilesStatement({
      series: [
        event({
          filters: [
            {
              id: 'f',
              name: 'profile.email',
              operator: 'is',
              value: ['a@b.c'],
            },
          ],
        }),
        event({ id: 'B', name: 'sign_up' }),
      ],
    });
    expect(render(statement).sql).toContain('profile.id = events.profile_id');
    await explain(statement);
  });
});

describe('funnel.sql / buildFunnelBase — cohort breakdowns', () => {
  it('adds the cohort join for a cohort breakdown', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown(`cohort:${COHORT_ID}`)],
    });
    const { sql, text } = render(statement);

    // The breakdown renders `cohort_<id>.profile_id`, so its join must exist.
    const alias = `cohort_${COHORT_ID.replace(/-/g, '_')}`;
    expect(sql).toContain(`${alias}.profile_id`);
    expect(sql).toContain(`AS ${alias}`);
    // The cohort label is a bound value.
    expect(text).toContain('Power users');
    await explain(statement);
  });
});

describe('funnel.sql / buildFunnelBase — unknown breakdowns', () => {
  it('drops the all-cohorts breakdown, which the funnel cannot render', async () => {
    // Bare `cohort` is the chart's all-cohorts breakdown. The funnel has no
    // equivalent, and inlining it produced `cohort as b_0 FROM events` —
    // UNKNOWN_IDENTIFIER for the chart and the profile list alike.
    const statement = await profilesStatement({
      breakdowns: [breakdown('cohort')],
    });
    expect(render(statement).sql).not.toMatch(/\bcohort as b_0\b/);
    await explain(statement);
  });

  it('drops an unrecognised breakdown name entirely', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown('not_a_real_column')],
    });
    expect(render(statement).sql).not.toContain('not_a_real_column');
    await explain(statement);
  });

  it('drops unsupported breakdowns identically for chart and profiles', async () => {
    const breakdowns = [
      breakdown('cohort'),
      breakdown('profile.properties.plan'),
    ];
    const chart = await chartStatement({ breakdowns });
    const profiles = await profilesStatement({ breakdowns });

    // Both sides must resolve the same breakdown to the same b_N index,
    // otherwise the breakdownValues filter targets the wrong column.
    const attribution = 'argMinIf(`profile.properties.plan`, created_at,';
    expect(render(chart).sql).toContain(attribution);
    expect(render(profiles).sql).toContain(attribution);
    await explain(chart);
    await explain(profiles);
  });
});

describe('funnel.sql / funnel CTE — step pre-filter', () => {
  // Only rows matching at least one step can advance windowFunnel, so the
  // funnel CTE must not feed rows that share a step's event name but fail its
  // filters into the aggregation. Each step's COMPLETE condition therefore
  // appears in two places: inside windowFunnel and in the row-level
  // pre-filter. Asserting on the whole clause (not on a substring count)
  // catches a regression that drops a step from either one — and, unlike
  // counting, is not fooled by two steps whose conditions differ only in a
  // bound value.
  const conditionTexts = (series: ISeriesItem[]) =>
    funnelStepConditions(onlyReportEvents(series), PROJECT_ID, []).map(
      (condition) => normalize(condition.toStatement().query)
    );

  const windowFunnelClause = (conditions: string[]) =>
    `(toUInt64(toUnixTimestamp64Milli(created_at)), ${conditions.join(', ')}) AS level`;

  const preFilterClause = (conditions: string[]) =>
    ` AND ((${conditions.join(') OR (')})) GROUP BY `;

  it('filters the scan to rows matching at least one step condition', async () => {
    const sql = await chartSql([]);
    const conditions = conditionTexts(SERIES);
    expect(sql).toContain(windowFunnelClause(conditions));
    expect(sql).toContain(preFilterClause(conditions));
  });

  it("includes each step's own filters in the pre-filter", async () => {
    const series = [
      event({
        filters: [
          { id: 'f', name: 'path', operator: 'is', value: ['/pricing'] },
        ],
      }),
      event({ id: 'B', name: 'sign_up' }),
    ];
    const sql = render(await profilesStatement({ series })).sql;
    const conditions = conditionTexts(series);
    // The full filtered condition (path AND name) must gate the scan, not only
    // the windowFunnel arm — and so must the unfiltered second step.
    expect(conditions[0]).toContain('path');
    expect(sql).toContain(windowFunnelClause(conditions));
    expect(sql).toContain(preFilterClause(conditions));
  });

  it('pre-filtered funnel SQL still parses and resolves', async () => {
    await explain(
      await profilesStatement({
        breakdowns: [breakdown('profile.properties.plan')],
      })
    );
  });
});

describe('funnel.sql / buildFunnelBase — breakdown attribution', () => {
  // The breakdown value must be read at the user's FIRST funnel step, not used
  // as a windowFunnel GROUP BY key. Per-row grouping splits a user's steps
  // across buckets whenever the property isn't identical on every step, so the
  // sequence never connects and downstream steps show 0.
  it('attributes event-property breakdowns at the entry step', async () => {
    const sql = await chartSql([breakdown('properties.experiment')]);
    expect(await chartText([breakdown('properties.experiment')])).toContain(
      "argMinIf(properties['experiment'], created_at,"
    );
    // The windowFunnel aggregation groups by the primary key only; b_0 is an
    // aggregate, not a grouping key. (The outer chart GROUP BY level, b_0 is
    // unaffected.)
    expect(sql).toMatch(/GROUP BY session_id\b/);
    expect(sql).not.toMatch(/GROUP BY session_id, b_0/);
  });

  it('entry-step attribution parses and resolves', async () => {
    await explain(
      await chartStatement({ breakdowns: [breakdown('properties.experiment')] })
    );
  });

  it('keeps per-row grouping for group breakdowns (fan-out is intended)', async () => {
    // A user in three groups should appear in all three funnels, so group.*
    // breakdowns keep the ARRAY JOIN fan-out and per-row GROUP BY.
    const sql = await chartSql([breakdown('group.plan')]);
    expect(sql).not.toContain('argMinIf');
    expect(sql).toMatch(/GROUP BY session_id, b_0/);
  });

  it('group-breakdown SQL parses and resolves', async () => {
    await explain(
      await chartStatement({ breakdowns: [breakdown('group.plan')] })
    );
  });
});

describe('funnel.sql / funnel CTE — windowFunnel ordering', () => {
  it('uses the default (>=) ordering: same-millisecond steps still connect', async () => {
    const sql = await chartSql([]);
    expect(sql).not.toContain('strict_');
    expect(sql).toMatch(/windowFunnel\(\{p:UInt64\}\)\(/);
  });
});

describe('funnel.sql / buildFunnelBase — group breakdowns', () => {
  it('adds the group array join for a group breakdown', async () => {
    const statement = await profilesStatement({
      breakdowns: [breakdown('group.plan')],
    });
    const { sql } = render(statement);
    expect(sql).toContain('ARRAY JOIN groups AS _group_id');
    expect(sql).toContain('LEFT ANY JOIN _g ON _g.id = _group_id');
    await explain(statement);
  });
});

describe('funnel.sql / profile-property narrowing', () => {
  const seriesWithProfileFilter = [
    event({
      filters: [
        {
          id: 'f1',
          name: 'profile.properties.plan',
          operator: 'is' as const,
          value: ['pro'],
        },
      ],
    }),
    event({ id: 'B', name: 'sign_up' }),
  ];

  it('joins scalar columns instead of the whole properties Map', async () => {
    const statement = await profilesStatement({
      series: seriesWithProfileFilter,
      breakdowns: [breakdown('profile.properties.experiment')],
    });
    const { text } = render(statement);

    expect(text).toContain("properties['plan'] as `profile.properties.plan`");
    expect(text).toContain(
      "properties['experiment'] as `profile.properties.experiment`"
    );
    expect(text).not.toContain('properties as "profile.properties"');
    // Conditions (windowFunnel + pre-filter) and the breakdown expression are
    // rewritten to the scalar aliases.
    expect(text).not.toContain("profile.properties['plan']");
    expect(text).not.toContain("profile.properties['experiment']");
  });

  it('leaves funnels without profile-property refs untouched', async () => {
    expect(await chartSql([])).not.toContain('`profile.properties.');
  });

  it('narrowed funnel SQL parses and resolves', async () => {
    await explain(
      await chartStatement({
        series: seriesWithProfileFilter,
        breakdowns: [breakdown('profile.properties.experiment')],
      })
    );
  });
});
