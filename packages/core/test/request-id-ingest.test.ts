// ADR-018 R1/R3, the ingest half of `request-id-end-to-end.test.ts`.
//
// That file follows one requestId across the HTTP edge; this one follows it
// across the OTHER edge, the Kafka consumer, where until M10-006 the chain
// stopped at a log field: the handler bound the envelope's id to a `reqId`
// binding, then wrote its rows through boot-scoped clients and enqueued the
// boundary's session_end through boot-scoped producers, so nothing downstream
// carried it (docs/TECH_DEBT.md §2).
//
// Nothing here is mocked with `mock.module`. `createIncomingEventHandler` is
// the exact function `apps/api`'s main.ts hands to the consumer as
// `handleEvent`, and the seam under test — createCtx → createIncomingEventDeps
// → incomingEvent → ctx.buffers / ctx.db / ctx.services — is the real one.

import { beforeEach, expect, test } from 'bun:test';
import type { AppDeps, Buffers } from '../src/context';
import { createRecordingProducers } from '../src/jobs/testing';
import type { QueueProducerHandle } from '../src/jobs.registry';
import { queues } from '../src/jobs.registry';
import { type LogFn, type Logger, REQUEST_ID_HEADER } from '../src/logger';
import { formatClickhouseDate } from '../src/modules/event/src/dates';
import { createIncomingEventHandler } from '../src/modules/ingest/src/consumer-handler';
import type { IncomingEventPayload } from '../src/modules/ingest/src/incoming-event';
import type { IncomingEventBindings } from '../src/modules/ingest/src/incoming-event-handler';
import type { IClickhouseSession } from '../src/modules/session/session.service';

const SUPPLIED_REQUEST_ID = 'adr018-kafka-1';
const OTHER_REQUEST_ID = 'adr018-kafka-2';
const PROJECT_ID = 'proj_ingest';
const DEVICE_ID = 'device_ingest';
const CLOSED_SESSION_ID = 'session-closed';

interface CapturedLine {
  message: unknown;
  bindings: Record<string, unknown>;
}

/** pino's child semantics: a child's bindings ride on every line it writes. */
function bindingLogger(
  lines: CapturedLine[],
  bindings: Record<string, unknown> = {}
): Logger {
  const write: LogFn = (first: unknown, second?: unknown) => {
    lines.push({
      message: typeof first === 'string' ? first : second,
      bindings,
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

function makeSession(id: string): IClickhouseSession {
  const now = formatClickhouseDate(new Date());
  return {
    id,
    project_id: PROJECT_ID,
    device_id: DEVICE_ID,
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
 * enqueues a job, so one envelope exercises the whole fan-out.
 */
function stubDeps() {
  const lines: CapturedLine[] = [];
  const producers = createRecordingProducers(queues);
  const eventsBuffered: { id: string }[] = [];

  const buffers = {
    event: { add: (event: { id: string }) => eventsBuffered.push(event) },
    profile: { add: () => Promise.resolve() },
    session: {
      getExistingSession: () => Promise.resolve(null),
      ingest: () =>
        Promise.resolve({
          kind: 'boundary' as const,
          closed: makeSession(CLOSED_SESSION_ID),
          current: makeSession('session-new'),
        }),
    },
  } as unknown as Buffers;

  const deps: AppDeps = {
    db: {
      project: { updateMany: () => Promise.resolve({ count: 0 }) },
    } as unknown as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers,
    producers: producers as unknown as QueueProducerHandle,
    produceIncomingEvent: () => Promise.resolve(),
    logger: bindingLogger(lines),
    config: { selfHosted: false },
  };

  return { deps, lines, eventsBuffered, recorded: producers.recorded };
}

const bindings: IncomingEventBindings = {
  checkNotificationRulesForEvent: () => Promise.resolve(null),
  getCachedProject: () =>
    Promise.resolve({ firstEventAt: new Date(), filters: [] }),
  clearProjectCache: () => Promise.resolve(0),
};

function envelope(requestId?: string): IncomingEventPayload {
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
    projectId: PROJECT_ID,
    deviceId: DEVICE_ID,
    sessionId: 'session-new',
  };
}

let harness: ReturnType<typeof stubDeps>;

beforeEach(() => {
  harness = stubDeps();
});

/** Every hop's requestId, so a failure names the hop that broke. */
function trail(lines: CapturedLine[]) {
  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.bindings;

  return {
    createEventLog: bindingOf('Creating event')?.requestId,
    kafkaOffset: bindingOf('Creating event')?.kafkaOffset,
  };
}

test("the envelope's requestId reaches the handler's logger, its buffer write and the session_end it enqueues", async () => {
  const handleEvent = createIncomingEventHandler(harness.deps, bindings);

  await handleEvent(envelope(SUPPLIED_REQUEST_ID), {
    partition: 3,
    offset: '4711',
  });

  // Hop 1: the child logger the handler writes its per-event lines through.
  expect(trail(harness.lines)).toEqual({
    createEventLog: SUPPLIED_REQUEST_ID,
    kafkaOffset: '4711',
  });

  // Hop 2: the ClickHouse row went through the ctx's buffer, not a client the
  // handler opened for itself. Two rows: `session_start` and the event.
  expect(harness.eventsBuffered).toHaveLength(2);

  // Hop 3: the boundary's session_end job, enqueued through `ctx.services`.
  // Before M10-006 this carried the boot scope's `v1-compat` id.
  expect(
    harness.recorded.map(({ queue, job, meta }) => ({
      queue,
      job,
      requestId: meta.requestId,
    }))
  ).toEqual([
    {
      queue: 'sessions',
      job: 'session',
      requestId: SUPPLIED_REQUEST_ID,
    },
  ]);
});

test('a second message is scoped to its own id, and an envelope without one still gets scoped', async () => {
  const handleEvent = createIncomingEventHandler(harness.deps, bindings);
  const meta = { partition: 0, offset: '1' };

  await handleEvent(envelope(SUPPLIED_REQUEST_ID), meta);
  await handleEvent(envelope(OTHER_REQUEST_ID), meta);
  await handleEvent(envelope(), meta);

  const enqueued = harness.recorded.map(
    ({ meta: jobMeta }) => jobMeta.requestId
  );
  expect(enqueued.slice(0, 2)).toEqual([SUPPLIED_REQUEST_ID, OTHER_REQUEST_ID]);

  const minted = enqueued[2];
  expect(minted).toBeString();
  expect(minted).not.toBe(SUPPLIED_REQUEST_ID);
  expect(minted).not.toBe(OTHER_REQUEST_ID);
});
