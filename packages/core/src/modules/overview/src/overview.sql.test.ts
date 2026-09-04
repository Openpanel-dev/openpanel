/**
 * SQL-shape tests for every `overview.sql.ts` builder. Same strategy as
 * chart/funnel/retention/sankey's own `*.sql.test.ts` (M7-003/004): render
 * the statement, then run `EXPLAIN <sql>` with its bound params against the
 * isolated `openpanel_test` ClickHouse (pinned by test/preload.ts). EXPLAIN
 * parses and resolves columns without executing, catching the two bugs this
 * module actually shipped during conversion — see overview.sql.proof.md —
 * without needing seeded rows.
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
        rawFilterWhere: '',
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
        rawFilterWhere: '',
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
        rawFilterWhere: '',
      })
    );
    await explain(
      OV.sessionMetricsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'month',
        rawFilterWhere: '',
      })
    );
  });

  it('metricsWithPageFilterQuery — the 5-CTE page-filtered metrics query', async () => {
    await explain(
      OV.metricsWithPageFilterQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        rawSessionFilterWhere: '',
        rawEventFilterWhere: '',
      })
    );
  });

  it('topPagesQuery', async () => {
    await explain(
      OV.topPagesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: '',
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
        rawFilterWhere: '',
        distinctSessionsCte: null,
      })
    );
  });

  it('topEntryExitQuery — distinct-sessions CTE (page filter branch)', async () => {
    const distinctSessionsCte = OV.distinctSessionsQuery({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      rawFilterWhere: '',
    });
    await explain(
      OV.topEntryExitQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        mode: 'exit',
        limit: 20,
        rawFilterWhere: '',
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
        rawFilterWhere: '',
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
        rawFilterWhere: '',
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
        rawFilterWhere: '',
        distinctSessionsCte: null,
      })
    );
    const distinctSessionsCte = OV.distinctSessionsQuery({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
      rawFilterWhere: '',
    });
    await explain(
      OV.topGenericSeriesTimeSeriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        column: 'referrer',
        prefixColumn: null,
        rawFilterWhere: '',
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
        rawFilterWhere: '',
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
        rawFilterWhere: '',
        steps: 5,
        topEntryPages: ['https://a.example.com/', 'https://a.example.com/pricing'],
      })
    );
  });

  it('topEventsQuery — with and without excludeEvents', async () => {
    await explain(
      OV.topEventsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: '',
        excludeEvents: ['session_start', 'session_end', 'screen_view'],
      })
    );
    await explain(
      OV.topEventsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: '',
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
        rawFilterWhere: '',
      })
    );
  });

  it('mapDataQuery', async () => {
    await explain(
      OV.mapDataQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        rawFilterWhere: '',
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
        rawFilterWhere: '',
        distinctSessionsCte: null,
      })
    ).toThrow();
  });
});
