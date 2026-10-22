// `deps.ch.query` is what ch-query.ts calls; the stub dispatches on the
// statement text so both of the usage query's statements can answer in one
// `Promise.all`.

import { beforeEach, expect, mock, test } from 'bun:test';
import {
  BILLING_USAGE_EVENT_NAMES_LIMIT,
  getOrganizationBillingUsage,
} from './organization.service';

interface ChCall {
  query: string;
  query_params: Record<string, unknown>;
}

let perProjectDayRows: { project_id: string; day: string; count: string }[] =
  [];
let perNameRows: { name: string; count: string }[] = [];
let perProjectNameRows: { project_id: string; name: string; count: string }[] =
  [];
const calls: ChCall[] = [];

function rowsFor(query: string) {
  if (query.includes('GROUP BY project_id, name')) {
    return perProjectNameRows;
  }
  if (query.includes('GROUP BY name')) {
    return perNameRows;
  }
  return perProjectDayRows;
}

const chQuery = mock(async (args: ChCall) => {
  calls.push(args);
  const rows = rowsFor(args.query);
  return {
    json: async () => ({ data: rows, meta: [], rows: rows.length }),
  };
});

const noop = () => undefined;
const deps = {
  ch: { query: chQuery },
  logger: {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => deps.logger,
  },
} as unknown as import('../../services').ServiceDeps;

beforeEach(() => {
  chQuery.mockClear();
  calls.length = 0;
  perProjectDayRows = [];
  perNameRows = [];
  perProjectNameRows = [];
});

test('pivots per-project counts onto a zero-filled day axis and totals them', async () => {
  // ClickHouse returns COUNT(*) as a string in JSON output.
  perProjectDayRows = [
    { project_id: 'web', day: '2026-10-01', count: '5' },
    { project_id: 'app', day: '2026-10-01', count: '2' },
    { project_id: 'web', day: '2026-10-03', count: '1' },
  ];
  perNameRows = [
    { name: 'screen_view', count: '6' },
    { name: 'purchase', count: '2' },
  ];
  perProjectNameRows = [
    { project_id: 'web', name: 'screen_view', count: '4' },
    { project_id: 'web', name: 'purchase', count: '2' },
    { project_id: 'app', name: 'screen_view', count: '2' },
  ];

  const usage = await getOrganizationBillingUsage(deps, {
    projectIds: ['web', 'app'],
    from: '2026-10-01',
    to: '2026-10-03',
  });

  expect(chQuery).toHaveBeenCalledTimes(3);
  expect(usage.days).toEqual([
    { day: '2026-10-01', counts: { web: 5, app: 2 } },
    { day: '2026-10-02', counts: {} },
    { day: '2026-10-03', counts: { web: 1 } },
  ]);
  expect(usage.projectTotals).toEqual({ web: 6, app: 2 });
  expect(usage.eventNames).toEqual([
    { name: 'screen_view', count: 6 },
    { name: 'purchase', count: 2 },
  ]);
  expect(usage.eventNamesByProject).toEqual({
    web: [
      { name: 'screen_view', count: 4 },
      { name: 'purchase', count: 2 },
    ],
    app: [{ name: 'screen_view', count: 2 }],
  });
});

test('every statement excludes session bookkeeping and the names are capped', async () => {
  await getOrganizationBillingUsage(deps, {
    projectIds: ['web'],
    from: '2026-10-01',
    to: '2026-10-01',
  });

  expect(calls).toHaveLength(3);
  for (const call of calls) {
    expect(call.query).toContain('name NOT IN');
    expect(Object.values(call.query_params)).toContainEqual([
      'session_start',
      'session_end',
    ]);
  }
  const nameCalls = calls.filter((call) =>
    /GROUP BY (project_id, )?name/.test(call.query)
  );
  expect(nameCalls).toHaveLength(2);
  for (const call of nameCalls) {
    expect(call.query).toContain('LIMIT');
    expect(Object.values(call.query_params)).toContainEqual(
      BILLING_USAGE_EVENT_NAMES_LIMIT
    );
  }
  expect(
    nameCalls.find((call) => call.query.includes('BY project_id'))?.query
  ).toContain('GROUP BY project_id, name');
});

test('an organization without projects gets the empty window without a query', async () => {
  const usage = await getOrganizationBillingUsage(deps, {
    projectIds: [],
    from: '2026-10-01',
    to: '2026-10-02',
  });

  expect(chQuery).not.toHaveBeenCalled();
  expect(usage.days.map((row) => row.day)).toEqual([
    '2026-10-01',
    '2026-10-02',
  ]);
  expect(usage.projectTotals).toEqual({});
  expect(usage.eventNames).toEqual([]);
  expect(usage.eventNamesByProject).toEqual({});
});
