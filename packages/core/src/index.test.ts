import { expect, test } from 'bun:test';
import * as core from './index';

// The curated barrel is the package's real public API: there is no `./*`
// wildcard to fall back on, so a name missing here is unreachable from apps/api.
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

// ONE tRPC instance: `initTRPC` is called in rpc/base.ts and nowhere else.
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

// Buffers are boot singletons on AppDeps, so main.ts needs only the FACTORY.
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
