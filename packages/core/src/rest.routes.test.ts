import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import client from 'prom-client';
import { stubAppDeps } from '../test/http-fixtures';
import { requestContext } from './http/context';
import { registry } from './metrics';
import { dashboardRoutes, opsRoutes, publicApiRoutes } from './rest.routes';

// An app built from the mounts plus requestContext answers a real request,
// end to end.
test('opsRoutes answers a liveness probe through requestContext', async () => {
  const { deps } = stubAppDeps();

  const app = new Elysia().use(requestContext(deps)).use(opsRoutes(deps));

  const response = await app.handle(
    new Request('http://localhost/healthz/live')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ live: true });
});

test('publicApiRoutes and dashboardRoutes compose, dashboardRoutes carrying gsc', async () => {
  const { deps } = stubAppDeps();

  const app = new Elysia()
    .use(requestContext(deps))
    .use(publicApiRoutes(deps))
    .use(dashboardRoutes(deps))
    .use(opsRoutes(deps));

  const response = await app.handle(
    new Request('http://localhost/healthz/live')
  );

  expect(response.status).toBe(200);
});

// /metrics serves prometheus text exposition from THE core registry — not a
// route-local one, not the prom-client global default.
test('/metrics serves the one core registry, prometheus text exposition', async () => {
  const { deps } = stubAppDeps();
  const probeName = 'core_rest_routes_metrics_probe_total';
  const probe = new client.Counter({
    name: probeName,
    help: 'test probe registered on the core registry',
    registers: [registry],
  });
  probe.inc();

  const app = new Elysia().use(requestContext(deps)).use(opsRoutes(deps));

  const response = await app.handle(new Request('http://localhost/metrics'));
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe(registry.contentType);
  expect(body).toContain(`${probeName} 1`);

  registry.removeSingleMetric(probeName);
});

// Liveness probes aren't public API: /healthz/live, /healthz/ready and
// /healthcheck are hidden from the OpenAPI document via `detail: { hide: true }`
// (health.routes.ts).
test('/openapi.json hides both /healthz/live and /metrics', async () => {
  const { deps } = stubAppDeps();

  const app = new Elysia().use(requestContext(deps)).use(opsRoutes(deps));

  const response = await app.handle(
    new Request('http://localhost/openapi.json')
  );

  expect(response.status).toBe(200);

  const document = (await response.json()) as {
    paths: Record<string, unknown>;
  };

  expect(document.paths['/healthz/live']).toBeUndefined();
  expect(document.paths['/metrics']).toBeUndefined();
});
