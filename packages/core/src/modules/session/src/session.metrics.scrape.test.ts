// The three at-scrape gauges do arithmetic over a Redis pipeline result, which
// is the half a name-only assertion would not catch.
import { expect, test } from 'bun:test';
import client from 'prom-client';
import {
  registerSessionScrapeMetrics,
  type SessionMetricsRedis,
} from './session.metrics';

type Reply = [Error | null, unknown][] | null;

function fakeRedis(projects: string[], replies: Reply): SessionMetricsRedis {
  return {
    smembers: () => Promise.resolve(projects),
    scard: () => Promise.resolve(projects.length),
    multi: () => ({
      zcard: () => undefined,
      get: () => undefined,
      exec: () => Promise.resolve(replies),
    }),
  };
}

test('sessions_active_total sums the per-project ZCARDs', async () => {
  const register = new client.Registry();
  registerSessionScrapeMetrics(
    () =>
      fakeRedis(
        ['proj_a', 'proj_b'],
        [
          [null, 3],
          [null, 4],
        ]
      ),
    register
  );

  const text = await register.metrics();
  expect(text).toContain('sessions_active_total 7');
  expect(text).toContain('sessions_projects_active 2');
});

test('no active projects reads zero rather than skipping the sample', async () => {
  const register = new client.Registry();
  registerSessionScrapeMetrics(() => fakeRedis([], null), register);

  const text = await register.metrics();
  expect(text).toContain('sessions_active_total 0');
  expect(text).toContain('sessions_hwm_lag_ms 0');
});

test('sessions_hwm_lag_ms takes the MAX lag and ignores unset HWMs', async () => {
  const register = new client.Registry();
  const now = Date.now();
  registerSessionScrapeMetrics(
    () =>
      fakeRedis(
        ['proj_a', 'proj_b', 'proj_c'],
        [
          [null, String(now - 5000)],
          // 0 / null means the project has no HWM yet — not a lag of `now`.
          [null, '0'],
          [null, String(now - 60_000)],
        ]
      ),
    register
  );

  const text = await register.metrics();
  const lag = Number(
    text
      .split('\n')
      .find((line) => line.startsWith('sessions_hwm_lag_ms '))
      ?.split(' ')[1]
  );
  expect(lag).toBeGreaterThanOrEqual(60_000);
  expect(lag).toBeLessThan(70_000);
});
