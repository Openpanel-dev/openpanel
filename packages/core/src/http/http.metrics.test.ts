import { beforeEach, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import client from 'prom-client';
import { registry } from '../metrics';
import { httpMetrics, observeHttpRequest } from './http.metrics';

const HISTOGRAM = 'http_request_duration_seconds';
const SUMMARY = 'http_request_summary_seconds';
const DROPPED = 'http_request_metrics_dropped_total';
const HOOK_SETTLE_MS = 10;

async function samples(name: string) {
  const metric = await registry.getSingleMetricAsString(name);
  return metric;
}

async function dropped() {
  const metric = await registry.getSingleMetric(DROPPED)?.get();
  return metric?.values[0]?.value;
}

beforeEach(() => {
  registry.resetMetrics();
});

test('both series exist on the ONE registry, with V1s names and labels', () => {
  const registered = registry.getMetricsAsArray().map((metric) => metric.name);
  expect(registered).toContain(HISTOGRAM);
  expect(registered).toContain(SUMMARY);

  // A second registry anywhere would be the defect: prom-client's own global
  // default must stay empty of these.
  expect(client.register.getMetricsAsArray().map((m) => m.name)).not.toContain(
    HISTOGRAM
  );
});

test('observes in SECONDS, under method/route/status_code', async () => {
  observeHttpRequest({
    method: 'POST',
    route: '/track',
    statusCode: 202,
    durationMs: 1500,
  });

  const text = await samples(HISTOGRAM);
  expect(text).toContain('method="POST"');
  expect(text).toContain('route="/track"');
  expect(text).toContain('status_code="202"');
  // 1500ms is 1.5s — a milliseconds observation would read 1500 here and
  // multiply every existing percentile by 1000.
  expect(text).toContain(
    `${HISTOGRAM}_sum{method="POST",route="/track",status_code="202"} 1.5`
  );
});

test('HEAD and OPTIONS are not measured (fastify-metrics methodBlacklist)', async () => {
  observeHttpRequest({
    method: 'OPTIONS',
    route: '/track',
    statusCode: 204,
    durationMs: 1,
  });
  observeHttpRequest({
    method: 'HEAD',
    route: '/track',
    statusCode: 200,
    durationMs: 1,
  });

  expect(await samples(HISTOGRAM)).not.toContain('route="/track"');
});

test('an unmatched request produces no series (registeredRoutesOnly)', async () => {
  observeHttpRequest({
    method: 'GET',
    route: '/*',
    statusCode: 404,
    durationMs: 1,
  });
  observeHttpRequest({
    method: 'GET',
    route: '',
    statusCode: 404,
    durationMs: 1,
  });

  expect(await samples(SUMMARY)).not.toContain('status_code="404"');
});

// The 2026-09-08 crash: a global `onAfterResponse` fires for a request whose
// `derive` never ran, `performance.now() - undefined` is NaN, prom-client
// throws on it, and in an async hook that throw exits the process.
test('a duration that is not a finite number >= 0 is dropped, not thrown on', async () => {
  const unobservable = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    undefined as unknown as number,
    -1,
  ];

  for (const durationMs of unobservable) {
    expect(() =>
      observeHttpRequest({
        method: 'GET',
        route: '/some-route',
        statusCode: 500,
        durationMs,
      })
    ).not.toThrow();
  }

  expect(await samples(HISTOGRAM)).not.toContain('route="/some-route"');
  expect(await samples(SUMMARY)).not.toContain('route="/some-route"');
  // Dropped, but visible.
  expect(await dropped()).toBe(unobservable.length);
});

test('the hook skips a request that matched no route, and drops nothing', async () => {
  const app = new Elysia().use(httpMetrics()).get('/ok', () => 'ok');

  await app.handle(new Request('http://localhost/ok'));
  await app.handle(new Request('http://localhost/definitely-not-a-route'));
  // `onAfterResponse` runs off the response's own microtask tail.
  await new Promise((resolve) => setTimeout(resolve, HOOK_SETTLE_MS));

  const text = await samples(HISTOGRAM);
  expect(text).toContain('route="/ok"');
  expect(text).not.toContain('definitely-not-a-route');
  expect(text).not.toContain('status_code="404"');
  // 0, not 1: the hook returns before it can compute a bad duration.
  expect(await dropped()).toBe(0);
});
