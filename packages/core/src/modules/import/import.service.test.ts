// M10-009: import.service.ts takes its clients from `ServiceDeps`, so this
// file hands in fakes as `deps.db` / `deps.ch` and mocks NO module at all.
// That is the point of the conversion: a module mock of
// `@openpanel/db/src/clickhouse/client` replaced that specifier for every
// other FILE in the process (bare `bun test` shares one module registry), and
// the v1-compat seam memoizes whatever it resolved while one was installed.

import { beforeAll, expect, mock, test } from 'bun:test';
import { testServices } from '../../../test/service-deps';
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
// The real client, spread into the fake below so a method the subject does
// not exercise is still the real one rather than `undefined`. Imported, not
// mocked: nothing here replaces the specifier for the rest of the process.
const actualClickhouseClient = await import(
  '@openpanel/db/src/clickhouse/client'
);

const importUpdate = mock(
  async (_opts: { where: { id: string }; data: unknown }) => undefined
);

// The subject's functions take `ServiceDeps`, so `deps.db` / `deps.ch` ARE
// the fakes below.
const deps = {
  db: { import: { update: importUpdate } },
  ch: {
    ...actualClickhouseClient.ch,
    insert: chInsert,
    command: mock(async () => undefined),
  },
} as unknown as import('../../services').ServiceDeps;

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
    deps,
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
    deps,
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
    deps,
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
  const service = createImportService(
    {
      db: {} as AppDeps['db'],
      ch: {} as AppDeps['ch'],
      redis: {} as AppDeps['redis'],
      clients: {} as AppDeps['clients'],
      buffers: {} as Buffers,
      logger: stubLogger(),
      queues: producers.queues,
    },
    testServices()
  );

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
