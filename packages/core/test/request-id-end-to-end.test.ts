// ADR-007 benchmark 3 / ADR-018 R1 — the requestId chain, end to end, on all
// three paths core actually has. One file, three sections:
//
//   1. HTTP  (P2-010's original): route log -> enqueued envelope meta -> job
//      handler's logger -> the enqueue that job makes. Four hops, one id.
//   2. CHART (M10-003): a REAL `ctx.services.chart` query, observed on the
//      ClickHouse call's own `query info` line. This is the hop the
//      `loadChClient()` loaders failed silently — a module that reached
//      @openpanel/db's client itself got a connection with no request scope,
//      so the id stopped at the service boundary (docs/TECH_DEBT.md §2).
//   3. KAFKA/INGEST (M10-006): the other edge. `createIncomingEventHandler` is
//      the exact function apps/api's main.ts hands the consumer, and the seam
//      under test — createCtx -> incomingEvent -> ctx.buffers / ctx.db /
//      ctx.services — is the real one. Nothing in this section is mocked.
//
// M10-009 merged sections 2 and 3 in from their own files, so the property
// these three prove together — that no path loses the id — is one file's
// result rather than three that could drift apart.
//
// Each half is already covered next to its own code — `createCtx` scoping the
// producers, `wrap` carrying `meta.requestId`, `runJob` reading it back. What
// no unit test can show is that they agree, and that agreement is the
// property core's shape was chosen for: if this goes red the design is wrong,
// not this file.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { z } from 'zod';
import type { AppDeps, Buffers } from '../src/context';
import { defineJob, defineQueue, type Producers } from '../src/jobs/define';
import { wrap } from '../src/jobs/envelope';
import {
  createRecordingProducers,
  type RecordedJob,
} from '../src/jobs/testing';
import type { QueueProducerHandle, QueueProducers } from '../src/jobs.registry';
import { queues } from '../src/jobs.registry';
import {
  type LogFn,
  type Logger,
  REQUEST_ID_HEADER,
  REQUEST_ID_LENGTH,
} from '../src/logger';
import { formatClickhouseDate } from '../src/modules/event/src/dates';
import { createIncomingEventHandler } from '../src/modules/ingest/src/consumer-handler';
import type { IncomingEventPayload } from '../src/modules/ingest/src/incoming-event';
import type { IncomingEventBindings } from '../src/modules/ingest/src/incoming-event-handler';
import type { IClickhouseSession } from '../src/modules/session/session.service';
import type { ServiceDeps } from '../src/services';
import { testCoreConfig } from './config-fixture';

const SUPPLIED_REQUEST_ID = 'adr007-benchmark-3';

/** The proof's service hop, and the shape the mocked container answers with. */
interface ProofServices {
  ingest: { record(name: string): Promise<string> };
}

// Snapshotted BEFORE `mock.module` below, not after — restoring by
// re-`import`ing later would resolve the already-mocked registry entry, not
// the real module (bare `bun test` shares one module registry across every
// file, and this specifier and `src/context.test.ts`'s `'./services'`
// resolve to the same file).
const realServicesModule = { ...(await import('../src/services')) };

// `Services` grows with every module that lands, so this proof mocks the
// whole container with a shape of its own rather than the real one — but the
// mock is a real service: built from the SCOPED ctx, logging to that request's
// logger and enqueueing through that request's producers. A hand-rolled
// function called from the route would skip exactly the seam under test.
// M10-009: the proof's `ingest.record` is layered ON TOP of the REAL
// container rather than replacing it — sections 2 and 3 below need
// `ctx.services.chart` and `ctx.services.session` to be the real ones. The
// mock is still a real service in the sense that matters: built from the
// SCOPED ctx, logging to that request's logger and enqueueing through that
// request's producers.
const createServices = mock((deps: ServiceDeps) => ({
  ...realServicesModule.createServices(deps),
  ingest: {
    ...realServicesModule.createServices(deps).ingest,
    record: async (name: string) => {
      deps.logger.info({ name }, 'service enqueuing');
      return await proofProducers(deps.queues).proof.primary.add({ name });
    },
  },
}));
mock.module('../src/services', () => ({
  ...realServicesModule,
  createServices,
}));

afterAll(() => {
  mock.module('../src/services', () => realServicesModule);
});

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
    db: {} as AppDeps['db'],
    prisma: {} as AppDeps['prisma'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    producers: producers as unknown as QueueProducerHandle,
    logger: bindingLogger(lines),
    config: testCoreConfig(),
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

// ===========================================================================
// Section 2 — the chart query hop (M10-003).
// ===========================================================================

const CHART_REQUEST_ID = 'm10-003-chart-query';
const CHART_PROJECT_ID = 'requestid-chart-project';

interface ChartLine {
  message: unknown;
  bindings: Record<string, unknown>;
  payload: Record<string, unknown>;
}

function chartLogger(
  lines: ChartLine[],
  bindings: Record<string, unknown> = {}
): Logger {
  const write: LogFn = (first: unknown, second?: unknown) => {
    lines.push({
      message: typeof first === 'string' ? first : second,
      bindings,
      payload: typeof first === 'string' ? {} : (first as ChartLine['payload']),
    });
  };
  return {
    fatal: write,
    error: write,
    warn: write,
    info: write,
    debug: write,
    trace: write,
    child: (extra) => chartLogger(lines, { ...bindings, ...extra }),
  };
}

const chartQueries: Array<{ query: string }> = [];

/** Just enough of the ClickHouse client for `runQuery`: one `query` that
 *  answers with an empty JSONEachRow result. */
function chartClickHouse(): AppDeps['ch'] {
  return {
    query: (params: { query: string }) => {
      chartQueries.push({ query: params.query });
      return Promise.resolve({
        json: () => Promise.resolve({ data: [], rows: 0, meta: [] }),
      });
    },
  } as unknown as AppDeps['ch'];
}

function chartDeps() {
  const lines: ChartLine[] = [];
  const producers = createRecordingProducers({});
  const deps: AppDeps = {
    db: {} as AppDeps['db'],
    prisma: {} as AppDeps['prisma'],
    ch: chartClickHouse(),
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    producers: producers as unknown as QueueProducerHandle,
    logger: chartLogger(lines),
    config: testCoreConfig(),
  };
  return { deps, lines };
}

// `getRetentionSeries` is the narrowest real chart query: one ClickHouse
// statement, no Postgres and no project-settings lookup, so what the test
// observes is the transport hop and nothing else.
function buildChartApp(deps: AppDeps) {
  const routes = defineRoutes((app) =>
    app.post('/proof/chart', async ({ ctx }) => ({
      rows: await ctx.services.chart.getRetentionSeries({
        projectId: CHART_PROJECT_ID,
      }),
    }))
  );
  return new Elysia().use(requestLogging(deps)).use(routes(deps));
}

beforeEach(() => {
  chartQueries.length = 0;
});

test("a chart query made through a request-scoped ctx logs the request's own requestId", async () => {
  const { deps, lines } = chartDeps();
  const response = await buildChartApp(deps).handle(
    new Request('http://localhost/proof/chart', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: CHART_REQUEST_ID },
    })
  );
  // onAfterResponse writes `request done` after `handle` resolves.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(response.status).toBe(200);

  // The query really ran through `deps.ch` — a silent miss would leave the
  // logger assertion below trivially true (AGENTS.md).
  expect(chartQueries).toHaveLength(1);
  expect(chartQueries[0]?.query).toContain('FROM events');

  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.bindings.requestId;

  // The ClickHouse call's own log line, and the route's, carry ONE requestId.
  expect(bindingOf('query info')).toBe(CHART_REQUEST_ID);
  expect(bindingOf('request done')).toBe(CHART_REQUEST_ID);
});

test('two concurrent requests do not share a requestId on their ClickHouse calls', async () => {
  const { deps, lines } = chartDeps();
  const app = buildChartApp(deps);

  const call = (requestId: string) =>
    app.handle(
      new Request('http://localhost/proof/chart', {
        method: 'POST',
        headers: { [REQUEST_ID_HEADER]: requestId },
      })
    );

  await Promise.all([call('req-a'), call('req-b')]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const queryLineIds = lines
    .filter((line) => line.message === 'query info')
    .map((line) => line.bindings.requestId);
  expect(queryLineIds.sort()).toEqual(['req-a', 'req-b']);
});

// ===========================================================================
// Section 3 — the Kafka/ingest handler hop (M10-006).
// ===========================================================================

const INGEST_REQUEST_ID = 'adr018-kafka-1';
const INGEST_OTHER_REQUEST_ID = 'adr018-kafka-2';
const INGEST_PROJECT_ID = 'proj_ingest';
const INGEST_DEVICE_ID = 'device_ingest';
const INGEST_CLOSED_SESSION_ID = 'session-closed';

interface IngestLine {
  message: unknown;
  ingestBindings: Record<string, unknown>;
}

/** pino's child semantics: a child's ingestBindings ride on every line it writes. */
function ingestLogger(
  lines: IngestLine[],
  ingestBindings: Record<string, unknown> = {}
): Logger {
  const write: LogFn = (first: unknown, second?: unknown) => {
    lines.push({
      message: typeof first === 'string' ? first : second,
      ingestBindings,
    });
  };

  return {
    fatal: write,
    error: write,
    warn: write,
    info: write,
    debug: write,
    trace: write,
    child: (extra) => ingestLogger(lines, { ...ingestBindings, ...extra }),
  };
}

function makeIngestSession(id: string): IClickhouseSession {
  const now = formatClickhouseDate(new Date());
  return {
    id,
    project_id: INGEST_PROJECT_ID,
    device_id: INGEST_DEVICE_ID,
    profile_id: '',
    event_count: 1,
    screen_view_count: 0,
    entry_path: '/',
    entry_origin: 'https://example.com',
    exit_path: '/',
    exit_origin: 'https://example.com',
    created_at: now,
    ended_at: now,
    os: 'Windows',
    os_version: '10',
    browser: 'Chrome',
    browser_version: '91',
    device: 'desktop',
    brand: '',
    model: '',
    country: 'US',
    region: 'NY',
    city: 'New York',
    longitude: 0,
    latitude: 0,
    duration: 0,
    referrer: '',
    referrer_name: '',
    referrer_type: '',
    is_bounce: true,
    utm_term: '',
    utm_source: '',
    utm_campaign: '',
    utm_content: '',
    utm_medium: '',
    revenue: 0,
    sign: 1,
    version: 1,
    groups: [],
  };
}

/**
 * A boundary on every message: it is the branch that both writes a row and
 * enqueues a job, so one ingestEnvelope exercises the whole fan-out.
 */
function ingestDeps() {
  const lines: IngestLine[] = [];
  const producers = createRecordingProducers(queues);
  const eventsBuffered: { id: string }[] = [];

  const eventBuffer = {
    add: (event: { id: string }) => eventsBuffered.push(event),
    // The consumer scope reaches the buffer through this view (M18-007); it
    // must still be the same buffer underneath.
    asRedeliverable: () => eventBuffer,
  };

  const buffers = {
    event: eventBuffer,
    profile: { add: () => Promise.resolve() },
    session: {
      getExistingSession: () => Promise.resolve(null),
      ingest: () =>
        Promise.resolve({
          kind: 'boundary' as const,
          closed: makeIngestSession(INGEST_CLOSED_SESSION_ID),
          current: makeIngestSession('session-new'),
        }),
    },
  } as unknown as Buffers;

  const deps: AppDeps = {
    prisma: {} as AppDeps['prisma'],
    db: {
      project: {
        // M15-005: the handler reads the project through
        // `project.service.ts`'s module-scope `getProjectByIdCached`, off the
        // message's own scope, instead of a binding resolved at boot.
        findUnique: () =>
          Promise.resolve({ firstEventAt: new Date(), filters: [] }),
        updateMany: () => Promise.resolve({ count: 0 }),
      },
    } as unknown as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers,
    producers: producers as unknown as QueueProducerHandle,
    logger: ingestLogger(lines),
    config: testCoreConfig(),
  };

  return { deps, lines, eventsBuffered, recorded: producers.recorded };
}

const ingestBindings: IncomingEventBindings = {
  checkNotificationRulesForEvent: () => Promise.resolve(null),
};

function ingestEnvelope(requestId?: string): IncomingEventPayload {
  return {
    geo: {
      country: 'US',
      city: 'New York',
      region: 'NY',
      longitude: 0,
      latitude: 0,
    },
    event: {
      name: 'screen_view',
      timestamp: new Date().toISOString(),
      isTimestampFromThePast: false,
      properties: { __path: 'https://example.com/pricing' },
    },
    uaInfo: {
      isServer: false,
      device: 'desktop',
      os: 'Windows',
      osVersion: '10',
      browser: 'Chrome',
      browserVersion: '91',
      brand: '',
      model: '',
    },
    headers: requestId ? { [REQUEST_ID_HEADER]: requestId } : {},
    projectId: INGEST_PROJECT_ID,
    deviceId: INGEST_DEVICE_ID,
    sessionId: 'session-new',
  };
}

let ingestHarness: ReturnType<typeof ingestDeps>;

beforeEach(() => {
  ingestHarness = ingestDeps();
});

/** Every hop's requestId, so a failure names the hop that broke. */
function ingestTrail(lines: IngestLine[]) {
  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.ingestBindings;

  return {
    createEventLog: bindingOf('Creating event')?.requestId,
    kafkaOffset: bindingOf('Creating event')?.kafkaOffset,
  };
}

test("the envelope's requestId reaches the handler's logger, its buffer write and the session_end it enqueues", async () => {
  const handleEvent = createIncomingEventHandler(
    ingestHarness.deps,
    ingestBindings
  );

  await handleEvent(ingestEnvelope(INGEST_REQUEST_ID), {
    partition: 3,
    offset: '4711',
  });

  // Hop 1: the child logger the handler writes its per-event lines through.
  expect(ingestTrail(ingestHarness.lines)).toEqual({
    createEventLog: INGEST_REQUEST_ID,
    kafkaOffset: '4711',
  });

  // Hop 2: the ClickHouse row went through the ctx's buffer, not a client the
  // handler opened for itself. Two rows: `session_start` and the event.
  expect(ingestHarness.eventsBuffered).toHaveLength(2);

  // Hop 3: the boundary's session_end job, enqueued through `ctx.services`.
  // Before M10-006 this carried the boot scope's compat id.
  expect(
    ingestHarness.recorded.map(({ queue, job, meta }) => ({
      queue,
      job,
      requestId: meta.requestId,
    }))
  ).toEqual([
    {
      queue: 'sessions',
      job: 'session',
      requestId: INGEST_REQUEST_ID,
    },
  ]);
});

// M15-004: the notification dispatch used to reach Postgres and the
// `notification` producer through the deleted compat seam's BOOT scope, so
// every job it enqueued was stamped with that scope's id no matter which
// message triggered it. It
// takes the caller's scope now, and this is the hop that proves it: the
// binding enqueues exactly what `triggerNotification` enqueues, off the deps
// it was handed, and the envelope must carry the message's own id.
test("a converted read path's own enqueue carries the message's requestId", async () => {
  const handleEvent = createIncomingEventHandler(ingestHarness.deps, {
    ...ingestBindings,
    checkNotificationRulesForEvent: (deps) =>
      deps.queues.notification.sendNotification.add({
        notification: {
          projectId: INGEST_PROJECT_ID,
          title: 'rule matched',
          message: 'screen_view',
        },
      }),
  });

  await handleEvent(ingestEnvelope(INGEST_REQUEST_ID), {
    partition: 0,
    offset: '1',
  });

  // One per event the message produced (session_start + screen_view); both
  // enqueued off the same message scope.
  const dispatched = ingestHarness.recorded
    .filter(({ queue }) => queue === 'notification')
    .map(({ job, meta }) => ({ job, requestId: meta.requestId }));

  expect(dispatched).toHaveLength(2);
  expect(dispatched).toEqual(
    dispatched.map(() => ({
      job: 'sendNotification',
      requestId: INGEST_REQUEST_ID,
    }))
  );
});

test('a second message is scoped to its own id, and an envelope without one still gets scoped', async () => {
  const handleEvent = createIncomingEventHandler(
    ingestHarness.deps,
    ingestBindings
  );
  const meta = { partition: 0, offset: '1' };

  await handleEvent(ingestEnvelope(INGEST_REQUEST_ID), meta);
  await handleEvent(ingestEnvelope(INGEST_OTHER_REQUEST_ID), meta);
  await handleEvent(ingestEnvelope(), meta);

  const enqueued = ingestHarness.recorded.map(
    ({ meta: jobMeta }) => jobMeta.requestId
  );
  expect(enqueued.slice(0, 2)).toEqual([
    INGEST_REQUEST_ID,
    INGEST_OTHER_REQUEST_ID,
  ]);

  const minted = enqueued[2];
  expect(minted).toBeString();
  expect(minted).not.toBe(INGEST_REQUEST_ID);
  expect(minted).not.toBe(INGEST_OTHER_REQUEST_ID);
});

// ===========================================================================
// Section 4 — one request, one id, all six hops (ADR-022 A3, M15-202).
// ===========================================================================
//
// Sections 1-3 each prove a segment: 1 the HTTP -> job chain through a
// MOCKED service, 2 a real converted read path with no job behind it, 3 the
// Kafka edge. A3 names the property Carl actually asked for — "follow what
// has happened for a certain request, and see the entire flow" — as one
// chain, and the hops it lists are:
//
//   requestId minted at the edge
//     -> ctx
//     -> a service's bound logger
//     -> producers.scope({ requestId })
//     -> the { payload, meta } envelope
//     -> the job's child logger
//
// Nothing below is a stand-in for a hop. The read path is
// `ctx.services.chart.getRetentionSeries`, a REAL converted service reaching
// ClickHouse through `deps.ch`; the enqueue is
// `ctx.services.cohort.enqueueCompute`, a REAL service writing onto
// `ctx.queues`; the envelope is what `wrap` produces from what the recording
// producer captured; and the job is the REAL `cohortCompute` definition and
// the REAL handler off `jobs.registry.ts`, which reaches ClickHouse again —
// so the last hop is a converted read path INSIDE a job, observed on its own
// `query info` line.
//
// Only the two connections are stubs, and both are the seam under test: the
// ClickHouse client records what it was asked and the Postgres client answers
// one row. A `load*` loader anywhere on this path, a client that built its
// own logger, or a handler that reached past `ctx` breaks exactly one of the
// assertions below and names itself.

const CHAIN_REQUEST_ID = 'adr022-a3-one-request';
const CHAIN_PROJECT_ID = 'chain-project';
const CHAIN_COHORT_ID = 'chain-cohort';

function chainDeps() {
  const lines: CapturedLine[] = [];
  const queried: string[] = [];
  const commanded: string[] = [];
  const inserted: string[] = [];
  // The real registry, so the enqueue below goes through the real
  // `cohortCompute` producer and is validated against the real payload schema.
  const producers = createRecordingProducers(queues);

  const ch = {
    query: (params: { query: string }) => {
      queried.push(params.query);
      return Promise.resolve({
        json: () => Promise.resolve({ data: [], rows: 0, meta: [] }),
      });
    },
    command: (params: { query: string }) => {
      commanded.push(params.query);
      return Promise.resolve({});
    },
    insert: (params: { table: string }) => {
      inserted.push(params.table);
      return Promise.resolve({});
    },
  } as unknown as AppDeps['ch'];

  const deps: AppDeps = {
    db: {
      cohort: {
        findUnique: () =>
          Promise.resolve({
            id: CHAIN_COHORT_ID,
            projectId: CHAIN_PROJECT_ID,
            definition: {
              type: 'property',
              criteria: {
                operator: 'and',
                properties: [
                  { name: 'country', operator: 'is', value: ['US'] },
                ],
              },
            },
          }),
        update: () => Promise.resolve({}),
      },
    } as unknown as AppDeps['db'],
    prisma: {} as AppDeps['prisma'],
    ch,
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    producers: producers as unknown as QueueProducerHandle,
    logger: bindingLogger(lines),
    config: testCoreConfig(),
  };

  return {
    deps,
    lines,
    queried,
    commanded,
    inserted,
    recorded: producers.recorded,
  };
}

/** The route: a converted read path, then a real service's enqueue. */
function buildChainApp(deps: AppDeps) {
  const routes = defineRoutes((app) =>
    app.post('/proof/chain', async ({ ctx }) => {
      await ctx.services.chart.getRetentionSeries({
        projectId: CHAIN_PROJECT_ID,
      });
      await ctx.services.cohort.enqueueCompute(CHAIN_COHORT_ID);
      return { ok: true };
    })
  );
  return new Elysia().use(requestLogging(deps)).use(routes(deps));
}

/** Every `query info` line, with the requestId its logger was bound to. */
function queryLineIds(lines: CapturedLine[]): unknown[] {
  return lines
    .filter((line) => line.message === 'query info')
    .map((line) => line.bindings.requestId);
}

test('one requestId reaches a converted read path, a real enqueue, the envelope and the job that runs it', async () => {
  const { deps, lines, queried, commanded, inserted, recorded } = chainDeps();

  const response = await buildChainApp(deps).handle(
    new Request('http://localhost/proof/chain', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: CHAIN_REQUEST_ID },
    })
  );
  await settled();

  expect(response.status).toBe(200);

  // Hop 3: a REAL service's ClickHouse call really ran, and its own log line
  // carries the request's id. A silent miss here would leave every assertion
  // below trivially true (AGENTS.md).
  expect(queried).toHaveLength(1);
  expect(queried[0]).toContain('FROM events');
  expect(queryLineIds(lines)).toEqual([CHAIN_REQUEST_ID]);

  // Hops 4 and 5: `producers.scope({ requestId })` stamped the envelope the
  // real `cohort` service enqueued.
  const enqueued = recorded.find(({ queue }) => queue === 'cohortCompute');
  if (!enqueued) {
    throw new Error('the route enqueued no cohortCompute job');
  }
  expect(enqueued.job).toBe('cohortCompute');
  expect(enqueued.payload).toEqual({ cohortId: CHAIN_COHORT_ID });
  expect(enqueued.meta.requestId).toBe(CHAIN_REQUEST_ID);

  // Hop 6: the REAL job, off the REAL registry definition, reading the REAL
  // envelope — and the converted read path it makes in turn.
  const queriesBeforeJob = queried.length;
  await runJob(
    queues.cohortCompute,
    {
      id: 'job_chain_1',
      name: enqueued.job,
      data: wrap(enqueued.payload, enqueued.meta),
      attemptsMade: 0,
    },
    deps
  );

  // The handler reached ClickHouse through `ctx.ch`, not a client of its own:
  // one more read, plus the membership DELETE and the metadata write that
  // `updateCohortMembership` makes on the same handle.
  expect(queried.length).toBeGreaterThan(queriesBeforeJob);
  expect(commanded.join('\n')).toContain('DELETE FROM');
  expect(inserted).toContain('cohort_metadata');

  // Every `query info` line in the process — the route's and the job's — is
  // the same request. This is the assertion A3 exists for.
  const allQueryIds = queryLineIds(lines);
  expect(allQueryIds.length).toBeGreaterThan(1);
  expect(new Set(allQueryIds)).toEqual(new Set([CHAIN_REQUEST_ID]));

  // And the job's child logger carries the job identity alongside it, so a
  // log search on the id shows the request AND what it caused.
  const jobLine = lines.find(
    (line) => line.message === 'query info' && line.bindings.job !== undefined
  );
  expect(jobLine?.bindings).toMatchObject({
    requestId: CHAIN_REQUEST_ID,
    queue: 'cohortCompute',
    job: 'cohortCompute',
    jobId: 'job_chain_1',
    attempt: 1,
  });
});

test('a job whose envelope carries no requestId is scoped to a fresh one, not to the last request', async () => {
  const { deps, lines, recorded } = chainDeps();

  await buildChainApp(deps).handle(
    new Request('http://localhost/proof/chain', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: CHAIN_REQUEST_ID },
    })
  );
  await settled();

  const enqueued = recorded.find(({ queue }) => queue === 'cohortCompute');
  if (!enqueued) {
    throw new Error('the route enqueued no cohortCompute job');
  }

  const linesBefore = lines.length;
  // What a scheduler enqueues: a payload with no originating request
  // (ADR-018 R2).
  await runJob(
    queues.cohortCompute,
    {
      id: 'job_chain_2',
      name: enqueued.job,
      data: wrap(enqueued.payload, {}),
      attemptsMade: 0,
    },
    deps
  );

  const jobIds = lines
    .slice(linesBefore)
    .filter((line) => line.message === 'query info')
    .map((line) => line.bindings.requestId);

  expect(jobIds.length).toBeGreaterThan(0);
  for (const id of jobIds) {
    expect(id).toBeString();
    expect(id).not.toBe(CHAIN_REQUEST_ID);
  }
});
