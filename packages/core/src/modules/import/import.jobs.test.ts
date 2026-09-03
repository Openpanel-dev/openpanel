// Job wiring — no ClickHouse/Postgres touched. The service methods
// themselves are exercised in import.service.test.ts.

import { expect, test } from 'bun:test';
import type { JobCtx } from '../../context';
import { createRecordingProducers } from '../../jobs/testing';
import { queues } from '../../jobs.registry';
import type { Logger } from '../../logger';
import type { Services } from '../../services';
import { importQueueJobs } from './import.jobs';
import type { ImportService } from './import.service';

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

function stubJobCtx(importService: Partial<ImportService>): JobCtx {
  const services: Services = {
    auth: {} as Services['auth'],
    insight: {} as Services['insight'],
    cohort: {} as Services['cohort'],
    gsc: {} as Services['gsc'],
    import: importService as ImportService,
  };
  return {
    db: {},
    ch: {},
    redis: {},
    clients: {},
    buffers: {},
    logger: stubLogger(),
    queues: createRecordingProducers(queues).queues,
    services,
    requestId: 'req_1',
    job: { id: 'job_1', attempt: 0, queue: 'import', name: 'import' },
  };
}

test('the import queue declares exactly the import job', () => {
  expect(Object.keys(importQueueJobs)).toEqual(['import']);
  expect(queues.import.jobs.import).toMatchObject({
    queue: 'import',
    name: 'import',
  });
});

test('import validates its payload', () => {
  expect(() => importQueueJobs.import.payload.parse({})).toThrow();
  expect(importQueueJobs.import.payload.parse({ importId: 'imp_1' })).toEqual({
    importId: 'imp_1',
  });
});

test('import delegates to ctx.services.import.run', async () => {
  const calls: unknown[] = [];
  const ctx = stubJobCtx({
    run: async (importId) => {
      calls.push(importId);
      return { success: true };
    },
  });

  await importQueueJobs.import.handler({
    payload: { importId: 'imp_1' },
    ctx,
  });

  expect(calls).toEqual(['imp_1']);
});
