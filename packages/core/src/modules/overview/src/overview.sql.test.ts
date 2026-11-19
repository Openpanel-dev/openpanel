/**
 * SQL-shape tests for every `overview.sql.ts` builder. Same strategy as
 * chart/funnel/retention/sankey's own `*.sql.test.ts`: render the statement,
 * then run `EXPLAIN <sql>` with its bound params against the isolated
 * `openpanel_test` ClickHouse (pinned by test/preload.ts). EXPLAIN parses and
 * resolves columns without executing, so a column typo is caught with no
 * seeded rows.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

const PROJECT_ID = 'test-sql-validation';
const START = '2026-08-01 00:00:00';
const END = '2026-08-08 00:00:00';

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let OV: typeof import('./overview.sql');

async function explain(fragment: SqlFragment): Promise<void> {
  const { query, query_params } = fragment.toStatement();
  await ch.command({ query: `EXPLAIN ${query}`, query_params });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  OV = await import('./overview.sql');
});

describe('overview.sql — parses against ClickHouse', () => {
  it('revenueQuery', async () => {
    await explain(
      OV.revenueQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        rawFilterWhere: null,
      })
    );
  });

  it('sessionMetricsQuery — GROUP BY/WITH ROLLUP/HAVING/WITH FILL clause order', async () => {
    await explain(
      OV.sessionMetricsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        rawFilterWhere: null,
      })
    );
  });

  it('sessionMetricsQuery — week and month buckets (Date-typed fill boundary)', async () => {
    await explain(
      OV.sessionMetricsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'week',
        rawFilterWhere: null,
      })
    );
    await explain(
      OV.sessionMetricsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'month',
        rawFilterWhere: null,
      })
    );
  });

  it('metricsWithPageFilterQuery — the single-scan page-filtered metrics query', async () => {
    await explain(
      OV.metricsWithPageFilterQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        rawSessionFilterWhere: null,
        rawEventFilterWhere: null,
      })
    );
  });

  it('topPagesQuery', async () => {
    await explain(
      OV.topPagesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
        limit: 20,
      })
    );
  });

  it('topEntryExitQuery — plain sessions filter', async () => {
    await explain(
      OV.topEntryExitQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        mode: 'entry',
        limit: 20,
        rawFilterWhere: null,
        distinctSessionsCte: null,
      })
    );
  });

  it('topEntryExitQuery — distinct-sessions CTE (page filter branch)', async () => {
    const distinctSessionsCte = OV.distinctSessionsQuery({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      rawFilterWhere: null,
    });
    await explain(
      OV.topEntryExitQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        mode: 'exit',
        limit: 20,
        rawFilterWhere: null,
        distinctSessionsCte,
      })
    );
  });

  it('topGenericQuery — no prefix column', async () => {
    await explain(
      OV.topGenericQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        column: 'country',
        prefixColumn: null,
        limit: 1000,
        rawFilterWhere: null,
        distinctSessionsCte: null,
      })
    );
  });

  it('topGenericQuery — with prefix column (region -> country)', async () => {
    await explain(
      OV.topGenericQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        column: 'region',
        prefixColumn: 'country',
        limit: 1000,
        rawFilterWhere: null,
        distinctSessionsCte: null,
      })
    );
  });

  it('topGenericSeriesTimeSeriesQuery — rawWhere always applied, plus optional distinct-sessions', async () => {
    await explain(
      OV.topGenericSeriesTimeSeriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        column: 'referrer',
        prefixColumn: null,
        rawFilterWhere: null,
        distinctSessionsCte: null,
      })
    );
    const distinctSessionsCte = OV.distinctSessionsQuery({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      rawFilterWhere: null,
    });
    await explain(
      OV.topGenericSeriesTimeSeriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        column: 'referrer',
        prefixColumn: null,
        rawFilterWhere: null,
        distinctSessionsCte,
      })
    );
  });

  it('topEntriesQuery — the deduped-paths array functions', async () => {
    await explain(
      OV.topEntriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
        steps: 5,
        topEntries: 3,
      })
    );
  });

  it('transitionsQuery — arrayJoin/arrayMap pair expansion', async () => {
    await explain(
      OV.transitionsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
        steps: 5,
        topEntryPages: [
          'https://a.example.com/',
          'https://a.example.com/pricing',
        ],
      })
    );
  });

  it('topEventsQuery — with and without excludeEvents', async () => {
    await explain(
      OV.topEventsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
        excludeEvents: ['session_start', 'session_end', 'screen_view'],
      })
    );
    await explain(
      OV.topEventsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
        excludeEvents: [],
      })
    );
  });

  it('topLinkOutQuery', async () => {
    await explain(
      OV.topLinkOutQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
      })
    );
  });

  it('mapDataQuery', async () => {
    await explain(
      OV.mapDataQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: null,
      })
    );
  });

  it('live* queries — the dashboard 30-minute window, moved off packages/trpc', async () => {
    await explain(OV.liveTotalSessionsQuery({ projectId: PROJECT_ID }));
    await explain(OV.liveMinuteCountsQuery({ projectId: PROJECT_ID }));
    await explain(OV.liveMinuteReferrersQuery({ projectId: PROJECT_ID }));
    await explain(OV.liveReferrersQuery({ projectId: PROJECT_ID }));
  });
});

describe('overview.sql — sql.id() identifier whitelists (R3)', () => {
  it('rejects a column name off the top-generic whitelist', () => {
    expect(() =>
      OV.topGenericQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        column: 'password',
        prefixColumn: null,
        limit: 10,
        rawFilterWhere: null,
        distinctSessionsCte: null,
      })
    ).toThrow();
  });
});

// The MCP tools send a bare `YYYY-MM-DD`; the dashboard sends the day's edges
// already. Both have to end up bounding the same last day, or every MCP range
// silently loses it.
describe('overview.sql — date-only range boundaries', () => {
  function boundsOf(fragment: SqlFragment): string[] {
    const { query_params } = fragment.toStatement();
    return Object.values(query_params).filter(
      (value): value is string =>
        typeof value === 'string' && value.startsWith('2026-08-')
    );
  }

  it('widens a bare end date to the end of that day', () => {
    const bounds = boundsOf(
      OV.revenueQuery({
        projectId: PROJECT_ID,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        interval: 'day',
        rawFilterWhere: null,
      })
    );

    expect(bounds).toContain('2026-08-01 00:00:00');
    expect(bounds).toContain('2026-08-31 23:59:59');
    expect(bounds).not.toContain('2026-08-31 00:00:00');
  });

  it('leaves an explicit datetime boundary exactly as given', () => {
    const bounds = boundsOf(
      OV.revenueQuery({
        projectId: PROJECT_ID,
        startDate: '2026-08-01 00:00:00',
        endDate: '2026-08-31 23:59:59',
        interval: 'day',
        rawFilterWhere: null,
      })
    );

    expect(bounds).toContain('2026-08-01 00:00:00');
    expect(bounds).toContain('2026-08-31 23:59:59');
  });
});
