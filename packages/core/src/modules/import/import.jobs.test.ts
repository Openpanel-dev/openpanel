// Job wiring — no ClickHouse/Postgres touched. The service methods
// themselves are exercised in import.service.test.ts.

import { expect, test } from 'bun:test';
import type { AppDeps, Buffers, JobCtx } from '../../context';
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
    notification: {} as Services['notification'],
    insight: {} as Services['insight'],
    integration: {} as Services['integration'],
    cohort: {} as Services['cohort'],
    ingest: {} as Services['ingest'],
    gsc: {} as Services['gsc'],
    import: importService as ImportService,
    organization: {} as Services['organization'],
    onboarding: {} as Services['onboarding'],
    session: {} as Services['session'],
    event: {} as Services['event'],
    profile: {} as Services['profile'],
    group: {} as Services['group'],
    chart: {} as Services['chart'],
    funnel: {} as Services['funnel'],
    conversion: {} as Services['conversion'],
    sankey: {} as Services['sankey'],
    retention: {} as Services['retention'],
    overview: {} as Services['overview'],
    pages: {} as Services['pages'],
    realtime: {} as Services['realtime'],
    misc: {} as Services['misc'],
    report: {} as Services['report'],
    dashboard: {} as Services['dashboard'],
    export: {} as Services['export'],
    share: {} as Services['share'],
    reference: {} as Services['reference'],
    client: {} as Services['client'],
    project: {} as Services['project'],
    user: {} as Services['user'],
    subscription: {} as Services['subscription'],
    salt: {} as Services['salt'],
    conversation: {} as Services['conversation'],
    assistant: {} as Services['assistant'],
    mcp: {} as Services['mcp'],
  };
  return {
    db: {} as AppDeps['db'],
    ch: {} as AppDeps['ch'],
    redis: {} as AppDeps['redis'],
    clients: {} as AppDeps['clients'],
    buffers: {} as Buffers,
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
