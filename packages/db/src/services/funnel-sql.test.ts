/**
 * SQL-syntax tests for the shared funnel query builder.
 *
 * Same strategy as chart-sql.test.ts: build the SQL string, then run
 * `EXPLAIN <sql>` against the local ClickHouse instance. EXPLAIN parses and
 * resolves columns without executing, so a breakdown expression referencing a
 * join alias that was never added fails here as UNKNOWN_IDENTIFIER — which is
 * exactly the class of bug that made funnel "View Users" return "No users
 * found" for profile-property and cohort breakdowns.
 *
 * Requires `pnpm dock:up` (or any locally reachable CH at
 * http://localhost:8123/openpanel). All tests auto-skip if CH is unreachable.
 */
import type { IChartBreakdown, IReportInput } from '@openpanel/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mockCohortFindMany = vi.hoisted(() => vi.fn());

vi.mock('../prisma-client', () => ({
  db: { cohort: { findMany: mockCohortFindMany } },
}));

import { ch } from '../clickhouse/client';
import { funnelService } from './funnel.service';

const PROJECT_ID = 'test-sql-validation';
const COHORT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';

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

let chReachable = false;

async function explain(sql: string): Promise<void> {
  await ch.command({ query: `EXPLAIN ${sql}` });
}

/** Mirrors what getFunnelProfiles builds on top of the shared base. */
async function buildProfilesSql(breakdowns: IChartBreakdown[]) {
  const { query } = await funnelService.buildFunnelBase({
    projectId: PROJECT_ID,
    startDate: START,
    endDate: END,
    series: SERIES,
    breakdowns,
    funnelWindow: 24,
    timezone: 'UTC',
  });
  query.with('funnel', 'SELECT * FROM session_funnel WHERE level != 0');
  query.select(['DISTINCT profile_id']).from('funnel');
  query.where('level', '>=', 2);
  return query.toSQL();
}

/** Mirrors what the funnel chart builds on top of the shared base. */
async function buildChartSql(breakdowns: IChartBreakdown[]) {
  const { query, breakdowns: resolved } = await funnelService.buildFunnelBase({
    projectId: PROJECT_ID,
    startDate: START,
    endDate: END,
    series: SERIES,
    breakdowns,
    funnelWindow: 24,
    timezone: 'UTC',
  });
  query.with('funnel', 'SELECT * FROM session_funnel WHERE level != 0');
  query
    .select([
      'level',
      ...resolved.map((_, index) => `b_${index}`),
      'count() as count',
    ])
    .from('funnel')
    .groupBy(['level', ...resolved.map((_, index) => `b_${index}`)]);
  return query.toSQL();
}

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  mockCohortFindMany.mockResolvedValue([
    { id: COHORT_ID, name: 'Power users' },
  ]);
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

// Reports as skipped rather than passed when CH is unreachable — a test that
// returns before asserting anything should not read as green.
const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async (ctx) => {
    if (!chReachable) {
      ctx.skip('ClickHouse not reachable at CLICKHOUSE_URL');
    }
    await fn();
  });

describe('funnel.service / buildFunnelBase — profile breakdowns', () => {
  itCH('adds the profiles join for a profile.properties breakdown', async () => {
    const sql = await buildProfilesSql([breakdown('profile.properties.plan')]);

    // The breakdown renders `profile.properties['plan']`, so the alias must exist.
    expect(sql).toContain("profile.properties['plan']");
    expect(sql).toMatch(/as profile/);
    expect(sql).toContain('profile.id = events.profile_id');
    await explain(sql);
  });

  itCH('selects the properties column, not a bare `properties` field', async () => {
    const sql = await buildProfilesSql([breakdown('profile.properties.plan')]);
    expect(sql).toMatch(/SELECT [^)]*properties[^)]*FROM .*profiles/);
    await explain(sql);
  });

  itCH('adds the profiles join for a top-level profile breakdown', async () => {
    const sql = await buildProfilesSql([breakdown('profile.email')]);
    expect(sql).toContain('profile.id = events.profile_id');
    await explain(sql);
  });

  itCH('adds the join for a profile filter with no profile breakdown', async () => {
    const { query } = await funnelService.buildFunnelBase({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      series: [
        event({
          filters: [
            { id: 'f', name: 'profile.email', operator: 'is', value: ['a@b.c'] },
          ],
        }),
        event({ id: 'B', name: 'sign_up' }),
      ],
      funnelWindow: 24,
      timezone: 'UTC',
    });
    query.with('funnel', 'SELECT * FROM session_funnel WHERE level != 0');
    query.select(['DISTINCT profile_id']).from('funnel');
    await explain(query.toSQL());
  });
});

describe('funnel.service / buildFunnelBase — cohort breakdowns', () => {
  itCH('adds the cohort join for a cohort breakdown', async () => {
    const sql = await buildProfilesSql([breakdown(`cohort:${COHORT_ID}`)]);

    // The breakdown renders `cohort_<id>.profile_id`, so its join must exist.
    const alias = `cohort_${COHORT_ID.replace(/-/g, '_')}`;
    expect(sql).toContain(`${alias}.profile_id`);
    expect(sql).toContain(`AS ${alias}`);
    expect(sql).toContain('Power users');
    await explain(sql);
  });
});

describe('funnel.service / buildFunnelBase — unknown breakdowns', () => {
  itCH('drops the all-cohorts breakdown, which the funnel cannot render', async () => {
    // Bare `cohort` is the chart's all-cohorts breakdown. The funnel has no
    // equivalent, and inlining it produced `cohort as b_0 FROM events` —
    // UNKNOWN_IDENTIFIER for the chart and the profile list alike.
    const sql = await buildProfilesSql([breakdown('cohort')]);
    expect(sql).not.toMatch(/\bcohort as b_0\b/);
    await explain(sql);
  });

  itCH('drops an unrecognised breakdown name entirely', async () => {
    const sql = await buildProfilesSql([breakdown('not_a_real_column')]);
    expect(sql).not.toContain('not_a_real_column');
    await explain(sql);
  });

  itCH('drops unsupported breakdowns identically for chart and profiles', async () => {
    const breakdowns = [
      breakdown('cohort'),
      breakdown('profile.properties.plan'),
    ];
    const chartSql = await buildChartSql(breakdowns);
    const profilesSql = await buildProfilesSql(breakdowns);

    // Both sides must resolve the same breakdown to the same b_N index,
    // otherwise the breakdownValues filter targets the wrong column.
    expect(chartSql).toContain("profile.properties['plan'] as b_0");
    expect(profilesSql).toContain("profile.properties['plan'] as b_0");
    await explain(chartSql);
    await explain(profilesSql);
  });
});

describe('funnel.service / buildFunnelCte — step pre-filter', () => {
  // Only rows matching at least one step can advance windowFunnel, so the
  // funnel CTE must not feed rows that share a step's event name but fail
  // its filters into the aggregation. The step conditions therefore appear
  // twice: inside windowFunnel and as a row-level pre-filter.
  it('filters the scan to rows matching at least one step condition', async () => {
    const sql = await buildChartSql([]);
    expect(sql).toContain(
      "((events.name = 'screen_view') OR (events.name = 'sign_up'))",
    );
    expect(sql.match(/events\.name = 'screen_view'/g)).toHaveLength(2);
  });

  it('includes each step\'s own filters in the pre-filter', async () => {
    const { query } = await funnelService.buildFunnelBase({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      series: [
        event({
          filters: [
            { id: 'f', name: 'path', operator: 'is', value: ['/pricing'] },
          ],
        }),
        event({ id: 'B', name: 'sign_up' }),
      ],
      funnelWindow: 24,
      timezone: 'UTC',
    });
    query.with('funnel', 'SELECT * FROM session_funnel WHERE level != 0');
    query.select(['DISTINCT profile_id']).from('funnel');
    const sql = query.toSQL();
    // The path filter must gate the scan, not only the windowFunnel arm.
    expect(sql.match(/\/pricing/g)!.length).toBeGreaterThanOrEqual(2);
  });

  itCH('pre-filtered funnel SQL still parses and resolves', async () => {
    const sql = await buildProfilesSql([breakdown('profile.properties.plan')]);
    await explain(sql);
  });
});

describe('funnel.service / buildFunnelBase — group breakdowns', () => {
  itCH('adds the group array join for a group breakdown', async () => {
    const sql = await buildProfilesSql([breakdown('group.plan')]);
    expect(sql).toContain('ARRAY JOIN groups AS _group_id');
    expect(sql).toContain('LEFT ANY JOIN _g ON _g.id = _group_id');
    await explain(sql);
  });
});
