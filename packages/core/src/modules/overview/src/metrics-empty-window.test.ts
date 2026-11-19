/**
 * `sessionMetricsQuery` emits its window totals as a `WITH ROLLUP` row, and
 * `HAVING sum(sign) > 0` drops that row when the window holds no sessions.
 * `getMetrics` must then still return every filled bucket: the previous-period
 * line on the overview pairs buckets with the current period by index, so a
 * series that is one short leaves the last bucket without a value.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { ServiceDeps } from '../../../services';

const PROJECT_ID = 'overview-metrics-empty-window-test';
const SESSION_DAY = '2026-01-05';
const EMPTY_WINDOW = {
  startDate: '2025-12-01 00:00:00',
  endDate: '2025-12-15 00:00:00',
};
const POPULATED_WINDOW = {
  startDate: '2026-01-01 00:00:00',
  endDate: '2026-01-15 00:00:00',
};
const BUCKETS_PER_WINDOW = 14;

let ch: typeof import('@openpanel/db/src/clickhouse/client').ch;
let getMetrics: typeof import('../overview.service').getMetrics;

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function metricsFor(window: { startDate: string; endDate: string }) {
  const deps = { ch, logger: silentLogger } as unknown as ServiceDeps;
  return getMetrics(deps, {
    projectId: PROJECT_ID,
    filters: [],
    interval: 'day',
    timezone: 'UTC',
    ...window,
  });
}

beforeAll(async () => {
  ({ ch } = await import('@openpanel/db/src/clickhouse/client'));
  ({ getMetrics } = await import('../overview.service'));

  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();

  await ch.command({
    query: `DELETE FROM sessions WHERE project_id = '${PROJECT_ID}'`,
  });
  await ch.insert({
    table: 'sessions',
    values: [
      {
        id: '00000000-0000-0000-0000-0000000000c1',
        project_id: PROJECT_ID,
        profile_id: 'profile-c1',
        device_id: 'device-c1',
        created_at: `${SESSION_DAY} 09:00:00`,
        ended_at: `${SESSION_DAY} 09:01:00`,
        is_bounce: false,
        entry_path: '/',
        exit_path: '/',
        screen_view_count: 2,
        event_count: 2,
        duration: 60,
        sign: 1,
        version: 1,
      },
    ],
    format: 'JSONEachRow',
  });
});

afterAll(async () => {
  await ch.command({
    query: `DELETE FROM sessions WHERE project_id = '${PROJECT_ID}'`,
  });
});

describe('getMetrics — series length', () => {
  it('returns every bucket of a window without sessions', async () => {
    const { metrics, series } = await metricsFor(EMPTY_WINDOW);

    expect(series).toHaveLength(BUCKETS_PER_WINDOW);
    expect(series[0]?.date).toBe('2025-12-01T00:00:00.000Z');
    expect(metrics.total_sessions).toBe(0);
  });

  it('keeps the totals row out of the series when the window has sessions', async () => {
    const { metrics, series } = await metricsFor(POPULATED_WINDOW);

    expect(series).toHaveLength(BUCKETS_PER_WINDOW);
    expect(series[0]?.date).toBe('2026-01-01T00:00:00.000Z');
    expect(metrics.total_sessions).toBe(1);
  });
});
