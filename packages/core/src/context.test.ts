import { beforeAll, expect, mock, test } from 'bun:test';
import type { AppDeps, Buffers, Ctx } from './context';
import type { JobMeta } from './jobs/envelope';
import { createRecordingProducers } from './jobs/testing';
import type { QueueProducers } from './jobs.registry';
import { queues } from './jobs.registry';
import type { Logger } from './logger';
import type { ServiceDeps, Services } from './services';

// mock.module is not hoisted, so the subject is imported inside beforeAll —
// see AGENTS.md. Mocking createServices is what makes "not built yet"
// observable at all — this suite cares about WHEN the factory runs, not what
// it returns, so the stub container is cast rather than built for real.
const serviceDeps: ServiceDeps[] = [];
const createServices = mock((deps: ServiceDeps): Services => {
  serviceDeps.push(deps);
  return {} as Services;
});
mock.module('./services', () => ({ createServices }));

let createCtx: typeof import('./context').createCtx;
let extendCtx: typeof import('./context').extendCtx;

beforeAll(async () => {
  ({ createCtx, extendCtx } = await import('./context'));
});

const REQUEST_ID = 'req_abcdefghijklmnopqrstu';

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

function stubDeps(): {
  deps: AppDeps;
  scopes: JobMeta[];
  scoped: QueueProducers[];
} {
  const scopes: JobMeta[] = [];
  const scoped: QueueProducers[] = [];
  const producers = createRecordingProducers(queues);

  return {
    scopes,
    scoped,
    deps: {
      db: {},
      ch: {},
      redis: {},
      clients: {},
      buffers: {} as Buffers,
      producers: {
        ...producers,
        scope(meta) {
          scopes.push(meta);
          const surface = producers.scope(meta);
          scoped.push(surface);
          return surface;
        },
      },
      produceIncomingEvent: () => Promise.resolve(),
      logger: stubLogger(),
      config: { selfHosted: true },
    },
  };
}

function build(): {
  ctx: Ctx;
  deps: AppDeps;
  scopes: JobMeta[];
  scoped: QueueProducers[];
} {
  const { deps, scopes, scoped } = stubDeps();
  const logger = deps.logger.child({ requestId: REQUEST_ID });
  return {
    ctx: createCtx(deps, { requestId: REQUEST_ID, logger }),
    deps,
    scopes,
    scoped,
  };
}

test('services are not built until they are read', () => {
  createServices.mockClear();

  const { ctx } = build();
  expect(createServices).not.toHaveBeenCalled();

  expect(ctx.services).toBeDefined();
  expect(createServices).toHaveBeenCalledTimes(1);
});

test('services are built once per ctx, and once per further ctx', () => {
  createServices.mockClear();

  const { ctx } = build();
  const first = ctx.services;
  expect(ctx.services).toBe(first);
  expect(createServices).toHaveBeenCalledTimes(1);

  build().ctx.services;
  expect(createServices).toHaveBeenCalledTimes(2);
});

test('the services graph is built from the scoped ctx, not from boot deps', () => {
  createServices.mockClear();
  serviceDeps.length = 0;

  const { ctx } = build();
  ctx.services;

  expect(createServices).toHaveBeenCalledTimes(1);
  expect(serviceDeps[0]?.logger).toBe(ctx.logger);
  expect(serviceDeps[0]?.queues).toBe(ctx.queues);
});

test('the requestId reaches the producer scope and the ctx', () => {
  const { ctx, scopes, scoped } = build();

  expect(scopes).toEqual([{ requestId: REQUEST_ID }]);
  expect(ctx.requestId).toBe(REQUEST_ID);
  expect(ctx.queues).toBe(scoped[0] as QueueProducers);
});

test('the logger is the caller-bound child, unwrapped', () => {
  const { deps } = stubDeps();
  const logger = deps.logger.child({ requestId: REQUEST_ID });

  expect(createCtx(deps, { requestId: REQUEST_ID, logger }).logger).toBe(
    logger
  );
});

test('boot handles are passed through by reference', () => {
  const { ctx, deps } = build();

  expect(ctx.db).toBe(deps.db);
  expect(ctx.ch).toBe(deps.ch);
  expect(ctx.redis).toBe(deps.redis);
  expect(ctx.clients).toBe(deps.clients);
  expect(ctx.buffers).toBe(deps.buffers);
});

test('extendCtx adds transport extras without building services', () => {
  createServices.mockClear();

  const { ctx } = build();
  const jobCtx = extendCtx(ctx, {
    job: { id: 'job_1', attempt: 1, queue: 'sessions', name: 'session' },
  });

  expect(jobCtx.job.id).toBe('job_1');
  expect(jobCtx.requestId).toBe(REQUEST_ID);
  expect(createServices).not.toHaveBeenCalled();

  expect(jobCtx.services).toBe(ctx.services);
  expect(createServices).toHaveBeenCalledTimes(1);
});

test('services survives a copy — enumerable, and spreading forces the build', () => {
  createServices.mockClear();

  const { ctx } = build();
  const copy = { ...ctx };

  expect(createServices).toHaveBeenCalledTimes(1);
  expect(copy.services).toBe(ctx.services);
  expect(createServices).toHaveBeenCalledTimes(1);
});
