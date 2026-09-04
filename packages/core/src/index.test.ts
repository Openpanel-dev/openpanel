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

// ONE tRPC instance (ADR-009): `initTRPC` is called in rpc/base.ts and
// nowhere else, so `@openpanel/trpc` has to reach the builder, the router
// factory and the two injected middleware factories through the barrel.
// This block shrinks as the 28 routers move into core's modules (P5-P8).
test('the rpc base is on the barrel, so there is one tRPC instance', () => {
  expect(core.procedure).toBeDefined();
  expect(core.middleware).toBeTypeOf('function');
  expect(core.createTRPCRouter).toBeTypeOf('function');
  expect(core.createCacheMiddleware).toBeTypeOf('function');
  expect(core.createRateLimitMiddleware).toBeTypeOf('function');
  expect(core.createAccessChecks).toBeTypeOf('function');
  expect(core.TRPCForbiddenError).toBeTypeOf('function');
});

test('a service, a client or a buffer is not on the barrel', () => {
  expect(Object.keys(core)).not.toContain('createServices');
});

// The buffers are boot singletons on AppDeps (ADR-007), so main.ts needs the
// FACTORY and nothing else. A named instance here would be the module
// singleton the design refuses.
test('buffers reach the barrel as a factory, never as instances', () => {
  expect(core.createBuffers).toBeTypeOf('function');
  expect(core.registerBufferMetrics).toBeTypeOf('function');
  for (const instance of [
    'eventBuffer',
    'profileBuffer',
    'profileBackfillBuffer',
    'botBuffer',
    'sessionBuffer',
    'replayBuffer',
    'groupBuffer',
  ]) {
    expect(Object.keys(core)).not.toContain(instance);
  }
});
