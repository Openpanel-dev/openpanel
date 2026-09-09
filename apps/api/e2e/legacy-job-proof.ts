/**
 * M9-001 acceptance proof: a LEGACY-shaped job already sitting in Redis is
 * still picked up and run by the V2 worker, with no drain and no rename
 * (ADR-005). Plus the other direction — a job the V2 producer enqueues
 * carries the `{payload, meta}` envelope and its `requestId` reaches the
 * handler's logger (ADR-018 R1).
 *
 * What is real here: the registry (`queues`), every `compat` hook, every job
 * payload schema, `resolveJob`, BullMQ, and Redis. The legacy jobs are put in
 * Redis by `Queue.add(name, data)` with V1's exact data — byte-for-byte the
 * call `packages/queue`'s producers make — before any worker starts, so they
 * are genuinely waiting on the list when the worker connects.
 *
 * Two deliberate narrowings, both stated in the output:
 *
 *  1. It runs on a `-m9001proof` queue-key namespace, not on the shared dev
 *     Redis's live `cron`/`sessions`/… keys, so it can neither consume nor be
 *     confused by whatever the golden harness left there. Only the key string
 *     differs; the un-namespaced keys' byte-identity is pinned separately by
 *     `packages/core/src/jobs/naming.test.ts`.
 *  2. `cron` runs its REAL handlers over the REAL boot buffers. The other six
 *     queues' handlers reach `ctx.services`, which needs the db/ch clients
 *     `AppDeps` does not carry until M9-002/M9-003, so for those six the
 *     handler body is a recorder — everything up to and including the handler
 *     lookup is the real thing.
 *
 * Run: `bash apps/api/e2e/legacy-job-proof.sh`
 */

process.env.TZ = 'UTC';

import {
  type AnyJob,
  type AppDeps,
  createBuffers,
  createProducers,
  type QueueDefinition,
  type Queues,
  queueKey,
  queues,
  startWorkers,
} from '@openpanel/core';
import { Redis } from '@openpanel/redis';
import pino from 'pino';

/** Isolates the proof from the shared dev Redis — see the header. */
const NAMESPACE = 'm9001proof';
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const JOB_WAIT_TIMEOUT_MS = 20_000;
const JOB_POLL_INTERVAL_MS = 100;
const REAL_HANDLER_QUEUE = 'cron';

type QueueKey = keyof Queues;

interface LegacyCase {
  queue: QueueKey;
  /** The BullMQ job name V1 put on the wire. */
  wireName: string;
  /** V1's job data, verbatim (was packages/queue/src/queues.ts). */
  data: unknown;
  /** The V2 job the compat hook must resolve it to. */
  expectJob: string;
  expectPayload: unknown;
}

// One per queue. Every `data` below is a V1 payload type from
// packages/queue/src/queues.ts; `undefined` fields are omitted because JSON
// drops them, which is exactly what is in Redis today.
const LEGACY_CASES: LegacyCase[] = [
  {
    queue: 'cron',
    wireName: 'flushEvents',
    data: { type: 'flushEvents' },
    expectJob: 'flushEvents',
    expectPayload: null,
  },
  {
    queue: 'sessions',
    wireName: 'session',
    data: {
      type: 'createSessionEnd',
      payload: { projectId: 'proj_m9001', deviceId: 'dev_m9001' },
      snapshot: {
        id: 'ses_m9001',
        project_id: 'proj_m9001',
        device_id: 'dev_m9001',
        ended_at: '2026-09-05 00:00:00',
      },
    },
    expectJob: 'session',
    expectPayload: {
      event: { projectId: 'proj_m9001', deviceId: 'dev_m9001' },
      snapshot: {
        id: 'ses_m9001',
        project_id: 'proj_m9001',
        device_id: 'dev_m9001',
        ended_at: '2026-09-05 00:00:00',
      },
    },
  },
  {
    queue: 'notification',
    wireName: 'sendNotification',
    data: {
      type: 'sendNotification',
      payload: {
        notification: {
          projectId: 'proj_m9001',
          title: 'legacy',
          message: 'still processed',
        },
      },
    },
    expectJob: 'sendNotification',
    expectPayload: {
      notification: {
        projectId: 'proj_m9001',
        title: 'legacy',
        message: 'still processed',
      },
    },
  },
  {
    queue: 'import',
    wireName: 'import',
    data: { type: 'import', payload: { importId: 'imp_m9001' } },
    expectJob: 'import',
    expectPayload: { importId: 'imp_m9001' },
  },
  {
    queue: 'insights',
    wireName: 'insightsProject',
    data: {
      type: 'insightsProject',
      payload: { projectId: 'proj_m9001', date: '2026-09-05' },
    },
    expectJob: 'insightsProject',
    expectPayload: { projectId: 'proj_m9001', date: '2026-09-05' },
  },
  {
    queue: 'gsc',
    wireName: 'gscProjectBackfill',
    data: {
      type: 'gscProjectBackfill',
      payload: { projectId: 'proj_m9001' },
    },
    expectJob: 'gscProjectBackfill',
    expectPayload: { projectId: 'proj_m9001' },
  },
  {
    // The one V1 payload with no discriminant at all — a bare `{cohortId}`,
    // which must NOT be mistaken for an envelope.
    queue: 'cohortCompute',
    wireName: 'cohortCompute',
    data: { cohortId: 'coh_m9001' },
    expectJob: 'cohortCompute',
    expectPayload: { cohortId: 'coh_m9001' },
  },
];

interface HandlerRun {
  queue: string;
  job: string;
  payload: unknown;
  requestId: string;
}

const runs: HandlerRun[] = [];
const logLines: string[] = [];
let failures = 0;

function pass(message: string) {
  process.stdout.write(`PASS: ${message}\n`);
}

function fail(message: string) {
  failures += 1;
  process.stdout.write(`FAIL: ${message}\n`);
}

function check(condition: boolean, message: string) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

/** Both records every line and lets it out, so the run is readable live. */
const logger = pino(
  { name: 'legacy-job-proof', level: 'debug' },
  {
    write: (line: string) => {
      logLines.push(line.trimEnd());
      process.stdout.write(line);
    },
  }
);

/**
 * The six queues whose real handlers need `ctx.services`. Only the handler
 * body is replaced: the queue's `compat` hook, `defaults`, `worker` settings
 * and every job's payload schema are the registry's own.
 */
function recordingCopy(definition: QueueDefinition): QueueDefinition {
  const jobs = Object.fromEntries(
    Object.entries(definition.jobs).map(([name, job]) => [
      name,
      {
        ...(job as AnyJob),
        queue: definition.name,
        name,
        handler: (async (args: {
          payload: unknown;
          ctx: { requestId: string };
        }) => {
          runs.push({
            queue: definition.name,
            job: name,
            payload: args.payload,
            requestId: args.ctx.requestId,
          });
        }) as AnyJob['handler'],
      },
    ])
  ) as QueueDefinition['jobs'];

  return { ...definition, jobs };
}

/**
 * Structurally identical to `queues` — same keys, same queue names, same
 * schemas — so the typed producer surface survives the cast.
 */
function proofRegistry(): Queues {
  return Object.fromEntries(
    Object.entries(queues).map(([key, definition]) => [
      key,
      key === REAL_HANDLER_QUEUE
        ? (definition as QueueDefinition)
        : recordingCopy(definition as QueueDefinition),
    ])
  ) as unknown as Queues;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const connections: Redis[] = [];
  const newConnection = () => {
    // BullMQ requires `maxRetriesPerRequest: null`; V1's `getRedisQueue` sets
    // the same three options.
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      enableOfflineQueue: true,
    });
    client.on('error', (error) =>
      logger.error({ err: error }, 'proof redis error')
    );
    connections.push(client);
    return client;
  };

  const producerConnection = newConnection();
  const registry = proofRegistry();

  const producers = createProducers(registry, {
    connection: producerConnection,
    namespace: NAMESPACE,
    logger,
  });

  const buffers = createBuffers({
    createLogger: (name) => logger.child({ name }),
    isCronPaused: async () => false,
    // Never flushed: this proof asserts BullMQ keys, not ClickHouse rows.
    ch: undefined as unknown as AppDeps['ch'],
  });

  const deps: AppDeps = {
    db: undefined as unknown as AppDeps['db'],
    ch: undefined as unknown as AppDeps['ch'],
    redis: undefined as unknown as AppDeps['redis'],
    clients: undefined as unknown as AppDeps['clients'],
    buffers,
    producers,
    logger,
    config: { selfHosted: false },
  };

  process.stdout.write(
    '\n--- keys ------------------------------------------------------\n' +
      `production key for 'cron'      : ${queueKey('cron')}\n` +
      `key this proof runs on         : ${queueKey('cron', { namespace: NAMESPACE })}\n`
  );

  // Never drain a buffer somebody else filled: the real `flushEvents` /
  // `flushGroups` handlers below write to ClickHouse if their list is
  // non-empty, and the buffers' Redis keys are fixed names on the shared
  // client — a namespace cannot isolate them.
  const buffered =
    (await buffers.event.getBufferSize()) +
    (await buffers.group.getBufferSize());
  if (buffered !== 0) {
    process.stdout.write(
      `\nABORT: the shared event/group buffers hold ${buffered} rows; running the real flush handlers would drain them. Refusing.\n`
    );
    await producers.close();
    for (const client of connections) {
      client.disconnect();
    }
    process.exit(1);
  }

  const queueByName = new Map(
    producers.bullQueues.map((queue) => [queue.name, queue])
  );
  const bullFor = (key: QueueKey) => {
    const queue = queueByName.get(queueKey(key, { namespace: NAMESPACE }));
    if (!queue) {
      throw new Error(`no bull queue for '${key}'`);
    }
    return queue;
  };

  // --- 1. Put the legacy jobs in Redis, before any worker exists -----------

  process.stdout.write(
    '\n--- legacy jobs written to Redis (raw stored bytes) -----------\n'
  );

  const enqueued: { legacyCase: LegacyCase; jobId: string }[] = [];
  for (const legacyCase of LEGACY_CASES) {
    const bull = bullFor(legacyCase.queue);
    const job = await bull.add(legacyCase.wireName, legacyCase.data as object);
    if (!job.id) {
      throw new Error(`no job id for ${legacyCase.queue}`);
    }
    enqueued.push({ legacyCase, jobId: job.id });

    const stored = await producerConnection.hget(
      `bull:${bull.name}:${job.id}`,
      'data'
    );
    process.stdout.write(
      `${legacyCase.queue.padEnd(14)} name=${legacyCase.wireName.padEnd(19)} data=${stored}\n`
    );
    check(
      stored !== null && !stored.includes('"meta"'),
      `${legacyCase.queue}: stored bytes carry no envelope (V1 shape)`
    );
  }

  // --- 2. One envelope job, from the V2 producer, for the round trip -------

  const requestId = 'm9001proof-req';
  const envelopeJobId = await producers
    .scope({ requestId })
    .cron.flushGroups.add(null);
  const envelopeStored = await producerConnection.hget(
    `bull:${bullFor('cron').name}:${envelopeJobId}`,
    'data'
  );
  process.stdout.write(
    '\n--- envelope job written by the V2 producer -------------------\n' +
      `cron           name=flushGroups         data=${envelopeStored}\n`
  );
  check(
    envelopeStored === `{"payload":null,"meta":{"requestId":"${requestId}"}}`,
    'producer stores {payload, meta} with the scoped requestId'
  );

  // --- 3. Now start the workers -------------------------------------------

  process.stdout.write(
    '\n--- worker log ------------------------------------------------\n'
  );

  const workers = startWorkers({
    definitions: registry,
    deps,
    createConnection: () => newConnection(),
    namespace: NAMESPACE,
    onTerminalFailure: (failure) =>
      fail(
        `${failure.queue}/${failure.job} failed terminally: ${failure.error.message}`
      ),
  });

  /**
   * `sessions` carries `removeOnComplete: true`, so a completed job is gone
   * from Redis rather than marked finished — the job was already added, so a
   * disappearance is a completion. A terminal failure would leave the job in
   * the failed set (and fire `onTerminalFailure`), not delete it.
   */
  const waitForCompletion = async (key: QueueKey, jobId: string) => {
    const bull = bullFor(key);
    const deadline = Date.now() + JOB_WAIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const job = await bull.getJob(jobId);
      if (!job) {
        return 'completed and removed';
      }
      if (job.finishedOn) {
        return await job.getState();
      }
      await delay(JOB_POLL_INTERVAL_MS);
    }
    return null;
  };

  for (const { legacyCase, jobId } of enqueued) {
    const state = await waitForCompletion(legacyCase.queue, jobId);
    check(
      state === 'completed' || state === 'completed and removed',
      `${legacyCase.queue}: legacy job ${jobId} was processed by the new worker (${state})`
    );
  }
  const envelopeState = await waitForCompletion('cron', envelopeJobId);
  check(
    envelopeState === 'completed' || envelopeState === 'completed and removed',
    `cron: envelope job ${envelopeJobId} was processed by the new worker (${envelopeState})`
  );

  // --- 4. Assertions on what the worker actually resolved ------------------

  process.stdout.write(
    '\n--- what the compat hooks resolved ----------------------------\n'
  );

  for (const legacyCase of LEGACY_CASES) {
    if (legacyCase.queue === REAL_HANDLER_QUEUE) {
      continue;
    }
    const run = runs.find(
      (candidate) =>
        candidate.queue === legacyCase.queue &&
        candidate.job === legacyCase.expectJob
    );
    process.stdout.write(
      `${legacyCase.queue.padEnd(14)} ${JSON.stringify(legacyCase.data)}\n` +
        `${''.padEnd(14)}  -> job=${run?.job} payload=${JSON.stringify(run?.payload)}\n`
    );
    check(
      run !== undefined &&
        JSON.stringify(run.payload) ===
          JSON.stringify(legacyCase.expectPayload),
      `${legacyCase.queue}: resolved to '${legacyCase.expectJob}' with V1's payload`
    );
  }

  const startedLegacy = logLines.filter(
    (line) => line.includes('"job started"') && line.includes('"legacy":true')
  );
  check(
    startedLegacy.length === LEGACY_CASES.length,
    `worker logged 'job started' with legacy:true for all ${LEGACY_CASES.length} legacy jobs (got ${startedLegacy.length})`
  );

  const realFlush = logLines.find(
    (line) =>
      line.includes('"job completed"') &&
      line.includes('"job":"flushEvents"') &&
      line.includes('"legacy":true')
  );
  check(
    realFlush !== undefined,
    "cron: the REAL flushEvents handler ran to completion off V1's `{type:'flushEvents'}`"
  );

  const envelopeLine = logLines.find(
    (line) =>
      line.includes('"job completed"') &&
      line.includes('"job":"flushGroups"') &&
      line.includes(`"requestId":"${requestId}"`)
  );
  check(
    envelopeLine !== undefined,
    'envelope job: the producer requestId reached the handler logger'
  );

  // --- 5. Clean the proof namespace up ------------------------------------

  await workers.close();
  await producers.close();

  const proofKeys = await producerConnection.keys(`bull:*-${NAMESPACE}*`);
  if (proofKeys.length > 0) {
    await producerConnection.del(...proofKeys);
  }
  process.stdout.write(`\ncleaned ${proofKeys.length} proof redis keys\n`);

  for (const client of connections) {
    client.disconnect();
  }

  process.stdout.write(
    failures === 0
      ? '\nlegacy-job-proof: all checks passed\n'
      : `\nlegacy-job-proof: ${failures} failure(s)\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stdout.write(
    `\nlegacy-job-proof: crashed\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exit(1);
});
