// import.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { beforeAll, expect, mock, test } from 'bun:test';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';

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

const chInsert = mock(async (_opts: { values: unknown[] }) => ({
  summary: { written_rows: '2' },
}));
// `ch.command`/`originalCh`/`chQuery`/`getReplicatedTableName`/
// `convertClickhouseDateToJs` and the extra TABLE_NAMES keys are unused here
// but included because `mock.module` replaces this specifier process-wide
// (bun runs every test file in one shared module registry without
// `--isolate` — see AGENTS.md) — gsc.service.test.ts, cohort.service.test.ts
// and insight.service.test.ts mock the same path, so every factory must be a
// superset of every consumer's needs, whichever one ends up registered last.
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ch: {
    insert: chInsert,
    command: mock(async () => undefined),
  },
  originalCh: {
    query: mock(async () => ({ json: async () => [] as unknown[] })),
    insert: mock(async () => undefined),
  },
  chQuery: mock(async () => [] as unknown[]),
  getReplicatedTableName: mock((table: string) => table),
  TABLE_NAMES: {
    events: 'events',
    events_imports: 'events_imports',
    profiles: 'profiles',
    sessions: 'sessions',
  },
  formatClickhouseDate: (date: Date | string) =>
    new Date(date)
      .toISOString()
      .replace('T', ' ')
      .replace(/(\.\d{3})?Z+$/, ''),
  convertClickhouseDateToJs: (date: string) =>
    new Date(`${date.replace(' ', 'T')}Z`),
}));

const importUpdate = mock(
  async (_opts: { where: { id: string }; data: unknown }) => undefined
);
mock.module('@openpanel/db/src/prisma-client', () => ({
  db: { import: { update: importUpdate } },
}));

let insertRawEventsBatch: typeof import('./import.service').insertRawEventsBatch;
let updateImportStatus: typeof import('./import.service').updateImportStatus;
let createImportService: typeof import('./import.service').createImportService;

beforeAll(async () => {
  ({ insertRawEventsBatch, updateImportStatus, createImportService } =
    await import('./import.service'));
});

test('insertRawEventsBatch stamps project_id/imported_at and flattens properties', async () => {
  chInsert.mockClear();

  const result = await insertRawEventsBatch(
    'proj_1',
    [
      {
        id: 'evt_1',
        name: 'screen_view',
        project_id: 'wrong_project',
        properties: { nested: { a: 1 } },
        created_at: '2025-01-01 00:00:00',
      } as never,
    ],
    stubLogger()
  );

  expect(result).toEqual({ writtenRows: 2 });
  expect(chInsert).toHaveBeenCalledTimes(1);

  const [{ values }] = chInsert.mock.calls[0] as [{ values: any[] }];
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({
    id: 'evt_1',
    project_id: 'proj_1',
    properties: { 'nested.a': '1' },
  });
  expect(values[0].imported_at).toBeTruthy();
});

test('updateImportStatus writes the loading step through both the progress reporter and Postgres', async () => {
  importUpdate.mockClear();
  const progressed: unknown[] = [];

  await updateImportStatus(
    stubLogger(),
    { updateProgress: (p) => progressed.push(p) },
    'imp_1',
    {
      step: 'loading',
      batch: '2025-01-01',
      totalEvents: 10,
      processedEvents: 5,
    }
  );

  expect(progressed).toEqual([
    {
      status: 'processing',
      currentStep: 'loading',
      currentBatch: '2025-01-01',
      statusMessage: 'Importing events from 2025-01-01',
      totalEvents: 10,
      processedEvents: 5,
    },
  ]);
  expect(importUpdate).toHaveBeenCalledTimes(1);
  const [{ where, data }] = importUpdate.mock.calls[0] as [
    { where: { id: string }; data: unknown },
  ];
  expect(where).toEqual({ id: 'imp_1' });
  expect(data).toEqual(progressed[0]);
});

test('updateImportStatus marks a failed step with its error message', async () => {
  importUpdate.mockClear();
  const progressed: unknown[] = [];

  await updateImportStatus(
    stubLogger(),
    { updateProgress: (p) => progressed.push(p) },
    'imp_1',
    { step: 'failed', errorMessage: 'boom' }
  );

  expect(progressed).toEqual([
    { status: 'failed', statusMessage: 'Import failed', errorMessage: 'boom' },
  ]);
});

test('ImportService.enqueue adds the import job onto the import queue', async () => {
  const producers = createRecordingProducers(queues);
  const service = createImportService({
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    logger: stubLogger(),
    queues: producers.queues,
  });

  const jobId = await service.enqueue('imp_1');

  expect(typeof jobId).toBe('string');
  expect(producers.recorded).toEqual([
    {
      queue: 'import',
      job: 'import',
      payload: { importId: 'imp_1' },
      meta: {},
    },
  ]);
});
