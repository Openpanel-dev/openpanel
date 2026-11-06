// Child process for consumer.rebalance.integration.test.ts; no API/Postgres needed.
import { getRedisCache } from '@openpanel/redis';
import { Kafka, logLevel } from 'kafkajs';
import { EventBuffer } from '../src/buffers/event-buffer';
import type { IClickhouseEvent } from '../src/modules/event/event.service';
import { createEventsBatchHandler } from '../src/modules/ingest/src/consumer';
import { stubBufferDeps } from './buffer-fixtures';
import { testCoreConfig } from './config-fixture';

const [topic, traceKey, worker] = process.argv.slice(2);
if (!(topic && traceKey && worker)) {
  throw new Error('Expected topic, trace key and worker number');
}
const redis = getRedisCache();
const buffer = new EventBuffer({
  ...stubBufferDeps,
  config: testCoreConfig({
    buffers: {
      ...stubBufferDeps.config.buffers,
      event: {
        ...stubBufferDeps.config.buffers.event,
        microBatchMs: 2,
        microBatchSize: 8,
      },
    },
  }),
});
const kafka = new Kafka({
  clientId: `rebalance-worker-${worker}`,
  brokers: ['127.0.0.1:29092'],
  logLevel: logLevel.ERROR,
});
const consumer = kafka.consumer({
  groupId: topic,
  sessionTimeout: 6000,
  heartbeatInterval: 100,
  maxWaitTimeInMs: 100,
});
const handler = createEventsBatchHandler({
  topic,
  maxAttempts: 1,
  initialRetryMs: 10,
  maxRetryMs: 25,
  /** Record deliveries independently of the queue that deduplication changes. */
  handleEvent: async (payload, delivery) => {
    await redis.rpush(
      traceKey,
      JSON.stringify({ worker, id: payload.id, ...delivery })
    );
    buffer.addRedeliverable({
      id: payload.id,
      project_id: payload.projectId,
      name: payload.event.name,
      properties: payload.event.properties,
    } as IClickhouseEvent);
    // Leave a batch in flight while another process joins the consumer group.
    await Bun.sleep(12);
  },
  openDurabilityWindow: () => buffer.openDurabilityWindow(),
  sendToDeadLetter: () => Promise.reject(new Error('Unexpected dead letter')),
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
  metrics: {
    handlerFailed: () => undefined,
    deadLettered: () => undefined,
    deadLetterFailed: () => undefined,
  },
  onActivity: () => undefined,
});
consumer.on(consumer.events.REBALANCING, () => {
  redis
    .rpush(traceKey, JSON.stringify({ worker, event: 'rebalance' }))
    .catch(() => undefined);
});
let stopping = false;
process.on('SIGTERM', async () => {
  if (stopping) {
    return;
  }
  stopping = true;
  try {
    await consumer.stop();
    await buffer.flushPendingOrThrow();
    await consumer.disconnect();
    await redis.quit();
    process.exit(0);
  } catch {
    process.exit(1);
  }
});
await consumer.connect();
await consumer.subscribe({ topic, fromBeginning: true });
await consumer.run({
  eachBatchAutoResolve: false,
  eachBatch: handler.eachBatch,
});
