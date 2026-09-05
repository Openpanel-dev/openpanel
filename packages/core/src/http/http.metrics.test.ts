import { beforeEach, expect, test } from 'bun:test';
import client from 'prom-client';
import { registry } from '../metrics';
import { observeHttpRequest } from './http.metrics';

const HISTOGRAM = 'http_request_duration_seconds';
const SUMMARY = 'http_request_summary_seconds';

async function samples(name: string) {
  const metric = await registry.getSingleMetricAsString(name);
  return metric;
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
