// ADR-007 benchmark 3 / ADR-018 R1. One request, four hops: the route's log
// line, the enqueued envelope's meta, the job handler's logger, and the enqueue
// that job makes. One requestId across all four.
//
// Each half is already covered next to its own code — `createCtx` scoping the
// producers, `wrap` carrying `meta.requestId`, `runJob` reading it back. What
// no unit test can show is that the four agree, and that agreement is the
// property core's shape was chosen for: if this goes red the design is wrong,
// not this file.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { z } from 'zod';
import type { AppDeps } from '../src/context';
import { defineJob, defineQueue, type Producers } from '../src/jobs/define';
import { wrap } from '../src/jobs/envelope';
import {
  createRecordingProducers,
  type RecordedJob,
} from '../src/jobs/testing';
import type { QueueProducerHandle, QueueProducers } from '../src/jobs.registry';
import {
  type LogFn,
  type Logger,
  REQUEST_ID_HEADER,
  REQUEST_ID_LENGTH,
} from '../src/logger';
import type { ServiceDeps } from '../src/services';

const SUPPLIED_REQUEST_ID = 'adr007-benchmark-3';

/** The proof's service hop, and the shape the mocked container answers with. */
interface ProofServices {
  ingest: { record(name: string): Promise<string> };
}

// `Services` grows with every module that lands, so this proof mocks the
// whole container with a shape of its own rather than the real one — but the
// mock is a real service: built from the SCOPED ctx, logging to that request's
// logger and enqueueing through that request's producers. A hand-rolled
// function called from the route would skip exactly the seam under test.
const createServices = mock(
  (deps: ServiceDeps) =>
    ({
      ingest: {
        record: async (name: string) => {
          deps.logger.info({ name }, 'service enqueuing');
          return await proofProducers(deps.queues).proof.primary.add({ name });
        },
      },
    }) satisfies ProofServices
);
mock.module('../src/services', () => ({ createServices }));

// mock.module is not hoisted (AGENTS.md), so everything that reaches
// `services` through `context.ts` is imported here rather than at the top.
let requestLogging: typeof import('../src/http/context').requestLogging;
let defineRoutes: typeof import('../src/http/define').defineRoutes;
let opsRoutes: typeof import('../src/rest.routes').opsRoutes;
let runJob: typeof import('../src/jobs/workers').runJob;

beforeAll(async () => {
  ({ requestLogging } = await import('../src/http/context'));
  ({ defineRoutes } = await import('../src/http/define'));
  ({ opsRoutes } = await import('../src/rest.routes'));
  ({ runJob } = await import('../src/jobs/workers'));
});

beforeEach(() => {
  createServices.mockClear();
});

// The seven registry queues declare no jobs yet — each module brings its own
// in P5-P8 — so the proof declares a queue of its own. Everything else on the
// path is the real machinery: real producers, real envelope, real runJob.
const proofQueue = defineQueue('proof', {
  jobs: {
    primary: defineJob({
      payload: z.object({ name: z.string() }),
      handler: async ({ payload, ctx }) => {
        ctx.logger.info({ name: payload.name }, 'job handled');
        // Hop 4: a job enqueueing through its own ctx, with no requestId in
        // hand and nothing to pass one to.
        await proofProducers(ctx.queues).proof.followUp.add({
          of: payload.name,
        });
      },
    }),
    followUp: defineJob({
      payload: z.object({ of: z.string() }),
      handler: () => Promise.resolve(),
    }),
  },
});

const proofRegistry = { proof: proofQueue };
type ProofRegistry = typeof proofRegistry;

/** The one seam where the nominal registry type is demanded and the proof's differs. */
function proofProducers(queues: QueueProducers): Producers<ProofRegistry> {
  return queues as unknown as Producers<ProofRegistry>;
}

interface CapturedLine {
  message: unknown;
  bindings: Record<string, unknown>;
  payload: Record<string, unknown>;
}

// pino's child semantics, and they are what makes the assertion direct: a
// child's bindings ride on every line it writes, so "the same requestId in the
// route log and in the job's log" is a field lookup rather than an inference
// about which child was created when.
function bindingLogger(
  lines: CapturedLine[],
  bindings: Record<string, unknown> = {}
): Logger {
  const write: LogFn = (first: unknown, second?: unknown) => {
    lines.push({
      message: typeof first === 'string' ? first : second,
      bindings,
      payload:
        typeof first === 'string' ? {} : (first as CapturedLine['payload']),
    });
  };

  return {
    fatal: write,
    error: write,
    warn: write,
    info: write,
    debug: write,
    trace: write,
    child: (extra) => bindingLogger(lines, { ...bindings, ...extra }),
  };
}

function stubDeps() {
  const producers = createRecordingProducers(proofRegistry);
  const lines: CapturedLine[] = [];

  const deps: AppDeps = {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    producers: producers as unknown as QueueProducerHandle,
    logger: bindingLogger(lines),
    config: { selfHosted: false },
  };

  return { deps, lines, recorded: producers.recorded };
}

// The health-mounted app of P2-009, plus the one route the proof needs: an
// enqueue has to start somewhere and no module owns a job yet.
function buildApp(deps: AppDeps) {
  const proofRoutes = defineRoutes((app) =>
    app.post('/proof/track', async ({ ctx }) => ({
      jobId: await (ctx.services as unknown as ProofServices).ingest.record(
        'e2e'
      ),
    }))
  );

  return new Elysia()
    .use(requestLogging(deps))
    .use(opsRoutes(deps))
    .use(proofRoutes(deps));
}

// onAfterResponse runs after `handle` resolves, which is where `request done`
// is written.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The envelope BullMQ would hold: `wrap` is what the real producer calls. */
const jobData = (recorded: RecordedJob) =>
  wrap(recorded.payload, recorded.meta);

async function runChain(headers: Record<string, string> = {}) {
  const { deps, lines, recorded } = stubDeps();
  const app = buildApp(deps);

  const response = await app.handle(
    new Request('http://localhost/proof/track', { method: 'POST', headers })
  );
  await settled();

  const enqueued = recorded[0];
  if (!enqueued) {
    throw new Error('the route enqueued nothing; there is no chain to follow');
  }

  await runJob(
    proofQueue,
    {
      id: 'job_1',
      name: enqueued.job,
      data: jobData(enqueued),
      attemptsMade: 0,
    },
    deps
  );

  return { app, response, lines, recorded };
}

/** Every hop's requestId in one object, so a failure names the hop that broke. */
function trail(lines: CapturedLine[], recorded: RecordedJob[]) {
  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.bindings.requestId;

  return {
    routeLog: bindingOf('request done'),
    serviceLog: bindingOf('service enqueuing'),
    enqueued: recorded[0]?.meta.requestId,
    jobLog: bindingOf('job handled'),
    secondEnqueue: recorded[1]?.meta.requestId,
  };
}

test('one requestId spans the route log, the enqueue, the job and its follow-up enqueue', async () => {
  const { app, response, lines, recorded } = await runChain({
    [REQUEST_ID_HEADER]: SUPPLIED_REQUEST_ID,
  });

  expect(response.status).toBe(200);
  // The mock is the service hop; a silent miss would leave the chain intact
  // and prove nothing (AGENTS.md).
  expect(createServices).toHaveBeenCalledTimes(1);

  expect(trail(lines, recorded)).toEqual({
    routeLog: SUPPLIED_REQUEST_ID,
    serviceLog: SUPPLIED_REQUEST_ID,
    enqueued: SUPPLIED_REQUEST_ID,
    jobLog: SUPPLIED_REQUEST_ID,
    secondEnqueue: SUPPLIED_REQUEST_ID,
  });

  // Hop 4 is a second enqueue, not the first one counted twice.
  expect(recorded.map(({ queue, job }) => `${queue}.${job}`)).toEqual([
    'proof.primary',
    'proof.followUp',
  ]);

  expect(
    (await app.handle(new Request('http://localhost/healthz/live'))).status
  ).toBe(200);
});

test('a minted requestId travels the same four hops, and does not leak into the next request', async () => {
  const first = await runChain();
  const second = await runChain();

  const minted = first.recorded[0]?.meta.requestId;
  expect(minted).toHaveLength(REQUEST_ID_LENGTH);

  expect(trail(first.lines, first.recorded)).toEqual({
    routeLog: minted,
    serviceLog: minted,
    enqueued: minted,
    jobLog: minted,
    secondEnqueue: minted,
  });

  expect(second.recorded[0]?.meta.requestId).not.toBe(minted as string);
});
