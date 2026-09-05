// import.service.ts's db/ch access is lazy (`await import(...)` inside each
// function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { beforeAll, expect, mock, test } from 'bun:test';
import type { AppDeps, Buffers } from '../../context';
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
// Spread the real module rather than hand-listing every export: `mock.module`
// replaces this specifier process-wide (bun runs every test file in one
// shared module registry without `--isolate` — see AGENTS.md), so a partial
// factory here silently breaks unrelated consumers (gsc/cohort/insight tests
// and now the mcp module's) that import an export this file never overrides.
// `ch` itself is one such export: only `insert` is what import.service.ts
// exercises, so `command` is stubbed and every other method (`query`, ...) is
// spread from the real client — a bare `{ insert, command }` replacement
// previously stripped `query` from every *other* consumer of this same
// live-bound singleton (e.g. `@openpanel/db`'s `OverviewService`/
// `PagesService`, constructed once at that module's own load time) for the
// rest of the process.
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);
mock.module('@openpanel/db/src/clickhouse/client', () => ({
  ...actualClickhouseClient,
  ch: {
    ...actualClickhouseClient.ch,
    insert: chInsert,
    command: mock(async () => undefined),
  },
  getReplicatedTableName: mock((table: string) => table),
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
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
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
    db: {} as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
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
