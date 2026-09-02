import { expect, test } from 'bun:test';
import * as core from './index';

// The curated barrel is the package's real public API (ADR-008 acceptance
// note): what apps/api needs to build AppDeps once and mount the three route
// surfaces plus the tRPC router. A name missing here is a name apps/api
// cannot reach — there is no `./*` wildcard to fall back on.
test('the mount surface is curated', () => {
  expect(core.appRouter).toBeDefined();
  expect(core.publicApiRoutes).toBeTypeOf('function');
  expect(core.dashboardRoutes).toBeTypeOf('function');
  expect(core.opsRoutes).toBeTypeOf('function');
  expect(core.createCtx).toBeTypeOf('function');
  expect(core.extendCtx).toBeTypeOf('function');
  expect(core.requestContext).toBeTypeOf('function');
  expect(core.requestLogging).toBeTypeOf('function');
  expect(core.createTrpcFetchHandler).toBeTypeOf('function');
  expect(core.queues).toBeDefined();
});

test('a service, a client or a buffer is not on the barrel', () => {
  expect(Object.keys(core)).not.toContain('createServices');
});
