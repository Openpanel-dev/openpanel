import { expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../../test/http-fixtures';
import { defineRoutes } from './define';

const healthRoutes = defineRoutes((app) =>
  app.get('/healthz/live', ({ ctx }) => ({ requestId: ctx.requestId }))
);

const exportRoutes = defineRoutes((app) =>
  app.get('/export/events', ({ ctx }) => ({ requestId: ctx.requestId }))
);

test('a module factory takes deps and hands ctx to its handlers', async () => {
  const { deps } = stubAppDeps();

  const response = await healthRoutes(deps).handle(
    new Request('http://localhost/healthz/live', {
      headers: { 'request-id': 'defined' },
    })
  );

  expect(await response.json()).toEqual({ requestId: 'defined' });
});

test('two modules compose into one surface on one ctx', async () => {
  const { deps, scopeCalls } = stubAppDeps();

  const app = new Elysia().use(healthRoutes(deps)).use(exportRoutes(deps));

  for (const path of ['/healthz/live', '/export/events']) {
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        headers: { 'request-id': 'composed' },
      })
    );
    expect(await response.json()).toEqual({ requestId: 'composed' });
  }

  // Two requests, two contexts — and not four, which is what a module-local
  // requestContext would have cost.
  expect(scopeCalls()).toBe(2);
});

test('the auth tiers are requestable from a module without extra wiring', async () => {
  const { deps } = stubAppDeps();

  const routes = defineRoutes((app) =>
    app.post('/manage/projects', ({ client }) => client.id, {
      clientAuth: { allow: ['root'] },
    })
  );

  const response = await routes(deps).handle(
    new Request('http://localhost/manage/projects', { method: 'POST' })
  );

  // The P2 authenticator resolves nobody; what is proven here is that the
  // macro ran and typed `client` onto the handler.
  expect(response.status).toBe(401);
});

// Compile-time half of the same claim, checked by `tsc --noEmit`: without the
// tier there is no principal to read.
defineRoutes((app) =>
  // @ts-expect-error - `client` exists only on a handler that requested clientAuth
  app.post('/unguarded', ({ client }) => client)
);
