/**
 * SQL-shape tests for `pages.sql.ts`. Same EXPLAIN-based strategy as
 * `overview.sql.test.ts` — see its header comment.
 */

import { beforeAll, describe, expect, it } from 'bun:test';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';

const PROJECT_ID = 'test-sql-validation';
const START = '2026-08-01 00:00:00';
const END = '2026-08-08 00:00:00';

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let PG: typeof import('./pages.sql');

async function explain(fragment: SqlFragment): Promise<void> {
  const { query, query_params } = fragment.toStatement();
  await ch.command({ query: `EXPLAIN ${query}`, query_params });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  PG = await import('./pages.sql');
});

describe('pages.sql — parses against ClickHouse', () => {
  it('topPagesQuery — no search', async () => {
    await explain(
      PG.topPagesQuery({ projectId: PROJECT_ID, startDate: START, endDate: END, limit: 20 })
    );
  });

  it('topPagesQuery — with search (the OR-grouped LIKE clause)', async () => {
    await explain(
      PG.topPagesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        search: 'pricing',
        limit: 20,
      })
    );
  });

  it('topPagesQuery — no limit', async () => {
    await explain(
      PG.topPagesQuery({ projectId: PROJECT_ID, startDate: START, endDate: END })
    );
  });

  it('topPagesQuery — page_titles is bounded to the requested range', () => {
    const { query, query_params } = PG.topPagesQuery({
      projectId: PROJECT_ID,
      startDate: START,
      endDate: END,
    }).toStatement();
    const titlesCte = query.slice(
      query.indexOf('page_titles AS ('),
      query.indexOf('screen_view_durations AS (')
    );

    expect(query).not.toContain('now()');
    expect(titlesCte).toContain(
      'created_at BETWEEN toDateTime({p2:String}) AND toDateTime({p3:String})'
    );
    expect(query_params.p2).toBe(START);
    expect(query_params.p3).toBe(END);
  });

  it('pageTimeseriesQuery — with origin/path filters, week bucket', async () => {
    await explain(
      PG.pageTimeseriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'week',
        filterOrigin: 'https://example.com',
        filterPath: '/pricing',
      })
    );
  });

  it('pageTimeseriesQuery — topPagesPerBucket (WITH FILL then LIMIT n BY)', async () => {
    // `WITH FILL` binds to the ORDER BY expression it follows, so a `DESC`
    // ranking column appended after it is rejected outright — this case pins
    // the working spelling.
    await explain(
      PG.pageTimeseriesQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        interval: 'day',
        topPagesPerBucket: 50,
      })
    );
  });

  it('pageConversionsQuery', async () => {
    await explain(
      PG.pageConversionsQuery({
        projectId: PROJECT_ID,
        startDate: START,
        endDate: END,
        conversionEvent: 'purchase',
        windowHours: 24,
        limit: 100,
      })
    );
  });
});
