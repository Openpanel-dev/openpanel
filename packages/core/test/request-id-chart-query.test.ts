// ADR-018 R1, through the analytics read path (M10-003).
//
// The sibling `request-id-end-to-end.test.ts` proves the chain across the
// route, the enqueue and the job — with the whole `Services` container
// mocked. This file proves the hop that mock replaces: a REAL
// `createServices`, a real `ctx.services.chart`, and the ClickHouse call the
// chart query makes, observed on the request's own logger.
//
// It is the criterion the `loadChClient()` loaders failed silently: a
// module that reached `@openpanel/db`'s client itself got a connection with
// no request scope, so the requestId stopped at the service boundary.

import { beforeEach, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import type { AppDeps, Buffers } from '../src/context';
import { requestLogging } from '../src/http/context';
import { defineRoutes } from '../src/http/define';
import { createRecordingProducers } from '../src/jobs/testing';
import type { QueueProducerHandle } from '../src/jobs.registry';
import { type LogFn, type Logger, REQUEST_ID_HEADER } from '../src/logger';

const SUPPLIED_REQUEST_ID = 'm10-003-chart-query';
const PROJECT_ID = 'requestid-chart-project';

interface CapturedLine {
  message: unknown;
  bindings: Record<string, unknown>;
  payload: Record<string, unknown>;
}

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

const queries: Array<{ query: string }> = [];

/** Just enough of the ClickHouse client for `runQuery`: one `query` that
 *  answers with an empty JSONEachRow result. */
function recordingClickHouse(): AppDeps['ch'] {
  return {
    query: (params: { query: string }) => {
      queries.push({ query: params.query });
      return Promise.resolve({
        json: () => Promise.resolve({ data: [], rows: 0, meta: [] }),
      });
    },
  } as unknown as AppDeps['ch'];
}

function stubDeps() {
  const lines: CapturedLine[] = [];
  const producers = createRecordingProducers({});
  const deps: AppDeps = {
    db: {} as AppDeps['db'],
    ch: recordingClickHouse(),
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
    producers: producers as unknown as QueueProducerHandle,
    produceIncomingEvent: () => Promise.resolve(),
    logger: bindingLogger(lines),
    config: { selfHosted: false },
  };
  return { deps, lines };
}

// `getRetentionSeries` is the narrowest real chart query: one ClickHouse
// statement, no Postgres and no project-settings lookup, so what the test
// observes is the transport hop and nothing else.
function buildApp(deps: AppDeps) {
  const routes = defineRoutes((app) =>
    app.post('/proof/chart', async ({ ctx }) => ({
      rows: await ctx.services.chart.getRetentionSeries({
        projectId: PROJECT_ID,
      }),
    }))
  );
  return new Elysia().use(requestLogging(deps)).use(routes(deps));
}

beforeEach(() => {
  queries.length = 0;
});

test("a chart query made through a request-scoped ctx logs the request's own requestId", async () => {
  const { deps, lines } = stubDeps();
  const response = await buildApp(deps).handle(
    new Request('http://localhost/proof/chart', {
      method: 'POST',
      headers: { [REQUEST_ID_HEADER]: SUPPLIED_REQUEST_ID },
    })
  );
  // onAfterResponse writes `request done` after `handle` resolves.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(response.status).toBe(200);

  // The query really ran through `deps.ch` — a silent miss would leave the
  // logger assertion below trivially true (AGENTS.md).
  expect(queries).toHaveLength(1);
  expect(queries[0]?.query).toContain('FROM events');

  const bindingOf = (message: string) =>
    lines.find((line) => line.message === message)?.bindings.requestId;

  // The ClickHouse call's own log line, and the route's, carry ONE requestId.
  expect(bindingOf('query info')).toBe(SUPPLIED_REQUEST_ID);
  expect(bindingOf('request done')).toBe(SUPPLIED_REQUEST_ID);
});

test('two concurrent requests do not share a requestId on their ClickHouse calls', async () => {
  const { deps, lines } = stubDeps();
  const app = buildApp(deps);

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
