/**
 * SQL-syntax tests for chart / overview query builders.
 *
 * Strategy: build the SQL string, then run `EXPLAIN <sql>` against the local
 * ClickHouse instance. EXPLAIN parses the query, resolves columns, and builds
 * the query plan without executing it — so we catch UNKNOWN_IDENTIFIER,
 * AMBIGUOUS_IDENTIFIER and bad JOIN ON expressions without needing seeded
 * data. WITH FILL TO < FROM is a runtime check, so it's covered by a plain
 * string assertion instead.
 *
 * Requires `pnpm dock:up` (or any locally reachable CH at
 * http://localhost:8123/openpanel). All tests auto-skip if CH is unreachable.
 */
import type { IChartBreakdown, IChartEvent } from '@openpanel/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ch } from '../clickhouse/client';
import {
  getAggregateChartSql as _getAggregateChartSql,
  getChartSql as _getChartSql,
} from './chart.service';
import { OverviewService } from './overview.service';

// IGetChartDataInput has display-only fields (metric, chartType, previous,
// etc.) that the SQL builders ignore. Tests only care about SQL output, so
// loosen the input type here.
const getChartSql: (input: any) => Promise<string> = _getChartSql as any;
const getAggregateChartSql: (input: any) => Promise<string> =
  _getAggregateChartSql as any;

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

let chReachable = false;

async function explain(sql: string): Promise<void> {
  // EXPLAIN runs the parser + analyzer and builds the query plan, which
  // catches UNKNOWN_IDENTIFIER and AMBIGUOUS_IDENTIFIER. It does not execute.
  await ch.command({ query: `EXPLAIN ${sql}` });
}

beforeAll(async () => {
  // The chart service is chatty; mute log spam during the test run.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    // CH not running locally — skip every test.
    chReachable = false;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!chReachable) {
      console.warn(
        '[chart-sql] skipping: ClickHouse not reachable at CLICKHOUSE_URL',
      );
      return;
    }
    await fn();
  });

describe('chart.service / getChartSql', () => {
  itCH(
    'qualifies properties[...] with `e.` when group join is present (fixes AMBIGUOUS_IDENTIFIER)',
    async () => {
      const sql = await getChartSql({
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
        interval: 'day',
        startDate: START,
        endDate: END,
        projectId: PROJECT_ID,
        timezone: 'UTC',
      });

      // Every map access on the events table must be aliased — the `_g` join
      // also exposes a `properties` column, so the bare form is ambiguous.
      expect(sql).not.toMatch(/(?<![._\w])properties\[/);
      expect(sql).toContain("e.properties['__query.utm_source']");

      await explain(sql);
    },
  );

  itCH(
    'works without group join (qualified form is still valid when alone)',
    async () => {
      const sql = await getChartSql({
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
        interval: 'day',
        startDate: START,
        endDate: END,
        projectId: PROJECT_ID,
        timezone: 'UTC',
      });
      await explain(sql);
    },
  );

  itCH(
    'drops the all-cohorts breakdown when the project has 0 cohorts',
    async () => {
      const sql = await getChartSql({
        event: event({ segment: 'user' }),
        breakdowns: [breakdown('cohort')],
        interval: 'day',
        startDate: START,
        endDate: END,
        // Use a project that almost certainly has no cohorts in PG.
        projectId: PROJECT_ID,
        timezone: 'UTC',
      });

      // The all-cohorts JOIN expanded to `_uc._uc_label_X = 'Unknown'`, a
      // constant predicate with no join key — CH rejects it. The fix is to
      // remove the breakdown entirely when there are no cohorts.
      expect(sql).not.toMatch(/_uc_label_\d+\s*=\s*'Unknown'/);
      expect(sql).not.toContain('_all_cohorts');

      await explain(sql);
    },
  );

  itCH('skips WITH FILL when endDate < startDate', async () => {
    const sql = await getChartSql({
      event: event(),
      breakdowns: [],
      interval: 'day',
      startDate: END, // inverted
      endDate: START,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });

    expect(sql).not.toContain('WITH FILL');
    // Plain query without FILL should still parse.
    await explain(sql);
  });

  itCH('skips WITH FILL when endDate equals startDate inverted (week)', async () => {
    const sql = await getChartSql({
      event: event(),
      breakdowns: [],
      interval: 'week',
      startDate: END,
      endDate: START,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    expect(sql).not.toContain('WITH FILL');
  });

  itCH('emits WITH FILL when the range is valid', async () => {
    const sql = await getChartSql({
      event: event(),
      breakdowns: [],
      interval: 'day',
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    expect(sql).toContain('WITH FILL');
    await explain(sql);
  });

  itCH('property metric (property_sum) with group join is unambiguous', async () => {
    const sql = await getChartSql({
      event: event({
        segment: 'property_sum',
        property: 'properties.revenue_amount',
        filters: [{ name: 'group.plan', operator: 'is', value: ['pro'] }],
      }),
      breakdowns: [],
      interval: 'day',
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    expect(sql).toContain("e.properties['revenue_amount']");
    await explain(sql);
  });

  itCH('one_event_per_user segment still parses', async () => {
    const sql = await getChartSql({
      event: event({ segment: 'one_event_per_user' }),
      breakdowns: [],
      interval: 'day',
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    await explain(sql);
  });
});

describe('chart.service / getAggregateChartSql', () => {
  itCH('drops all-cohorts breakdown on empty cohort project', async () => {
    const sql = await getAggregateChartSql({
      event: event({ segment: 'user' }),
      breakdowns: [breakdown('cohort')],
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    expect(sql).not.toMatch(/_uc_label_\d+\s*=\s*'Unknown'/);
    await explain(sql);
  });

  itCH('properties + group breakdown is unambiguous', async () => {
    const sql = await getAggregateChartSql({
      event: event({
        filters: [{ name: 'group.plan', operator: 'is', value: ['pro'] }],
      }),
      breakdowns: [breakdown('properties.__query.utm_source')],
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });
    expect(sql).toContain("e.properties['__query.utm_source']");
    await explain(sql);
  });
});

describe('overview.service / getRawWhereClause (UTM remapping)', () => {
  const svc = new OverviewService(ch);

  it('rewrites utm_* to properties[__query.utm_*] for the events table', () => {
    const where = svc.getRawWhereClause('events', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toContain("properties['__query.utm_source']");
    expect(where).not.toMatch(/(?<![._\w])utm_source\s*=/);
  });

  it('keeps utm_* as a top-level column for the sessions table', () => {
    const where = svc.getRawWhereClause('sessions', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toMatch(/(?<![._\w])utm_source\s*=/);
    expect(where).not.toContain("properties['__query.utm_source']");
  });

  it('drops non-whitelisted filters', () => {
    const where = svc.getRawWhereClause('events', [
      { name: 'malicious_column', operator: 'is', value: ['x'] },
    ]);
    expect(where).toBe('');
  });

  itCH('events utm_source filter parses against real events table', async () => {
    const where = svc.getRawWhereClause('events', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toBeTruthy();
    await explain(
      `SELECT count() FROM events WHERE project_id = '${PROJECT_ID}' AND ${where}`,
    );
  });

  itCH('sessions utm_source filter parses against real sessions table', async () => {
    const where = svc.getRawWhereClause('sessions', [
      { name: 'utm_source', operator: 'is', value: ['awn'] },
    ]);
    expect(where).toBeTruthy();
    await explain(
      `SELECT count() FROM sessions WHERE project_id = '${PROJECT_ID}' AND ${where}`,
    );
  });
});
