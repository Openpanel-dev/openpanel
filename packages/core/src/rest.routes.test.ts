import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../test/http-fixtures';
import { requestContext } from './http/context';
import { dashboardRoutes, opsRoutes, publicApiRoutes } from './rest.routes';

// The acceptance shape for ADR-007 decision 19: an app built from the mounts
// plus requestContext answers a real request, end to end.
test('opsRoutes answers a liveness probe through requestContext', async () => {
  const { deps } = stubAppDeps();

  const app = new Elysia().use(requestContext(deps)).use(opsRoutes(deps));

  const response = await app.handle(
    new Request('http://localhost/healthz/live')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ live: true });
});

test('publicApiRoutes and dashboardRoutes compose with no modules yet', async () => {
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
