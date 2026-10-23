import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient } from '@clickhouse/client';
import { getRedisCache } from '@openpanel/redis';
import { Kafka, logLevel } from 'kafkajs';
import {
  clickhouseUrl,
  TEST_CLICKHOUSE_DATABASE,
  TEST_REDIS_URL,
} from '../../../../../../test/databases';
import { bufferDepsWithCh } from '../../../../test/buffer-fixtures';
import { testCoreConfig } from '../../../../test/config-fixture';
import { EventBuffer } from '../../../buffers/event-buffer';

// Explicit opt-in: this test owns the event-buffer keys on the isolated Redis.
const INPUT_COUNT = 2000;
const DEADLINE_MS = 60_000;

/** Bound startup and lag polling so a stalled test service fails the case. */
async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error('Timed out waiting for Kafka rebalance/consumer lag');
}

describe.skipIf(process.env.RUN_KAFKA_REBALANCE_TESTS !== '1')(
  'Kafka rebalance',
  () => {
    for (const { workers, producerIds } of [
      { workers: 2, producerIds: true },
      { workers: 3, producerIds: true },
      { workers: 2, producerIds: false },
    ]) {
      test(
        `${workers} workers, ${producerIds ? 'producer' : 'legacy'} ids survive rebalance`,
        async () => {
          const suffix = randomUUID().replaceAll('-', '');
          const topic = `rebalance-${suffix}`;
          const traceKey = `${topic}:trace`;
          const database = `${TEST_CLICKHOUSE_DATABASE}_rebalance_${suffix}`;
          const kafka = new Kafka({
            brokers: ['127.0.0.1:29092'],
            clientId: topic,
            logLevel: logLevel.ERROR,
          });
          const admin = kafka.admin();
          const producer = kafka.producer();
          const maintenance = createClient({ url: clickhouseUrl('default') });
          const ch = createClient({
            url: clickhouseUrl(database),
            json: {
              stringify: <T>(value: T) =>
                typeof value === 'string' ? value : JSON.stringify(value),
            },
          });
          const redis = getRedisCache();
          const children: ReturnType<typeof Bun.spawn>[] = [];
          const logs: Promise<string>[] = [];
          const startWorker = (worker: number) => {
            const child = Bun.spawn(
              [
                process.execPath,
                resolve(
                  import.meta.dir,
                  '../../../../test/kafka-rebalance-worker.ts'
                ),
                topic,
                traceKey,
                String(worker),
              ],
              {
                env: { ...process.env, REDIS_URL: TEST_REDIS_URL },
                stdout: 'pipe',
                stderr: 'pipe',
              }
            );
            children.push(child);
            logs.push(
              new Response(child.stdout).text(),
              new Response(child.stderr).text()
            );
          };
          try {
            await admin.connect();
            await producer.connect();
            await admin.createTopics({
              topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
            });
            await maintenance.command({ query: `CREATE DATABASE ${database}` });
            await ch.command({
              query:
                'CREATE TABLE events (id String, project_id String, name String, properties JSON) ENGINE=MergeTree ORDER BY id',
            });
            const keys = await redis.keys('event_buffer:*');
            if (keys.length) {
              await redis.del(...keys);
            }
            await producer.send({
              topic,
              messages: Array.from({ length: INPUT_COUNT }, (_, seq) => ({
                key: `key-${seq % 4}`,
                value: JSON.stringify({
                  ...(producerIds ? { id: randomUUID() } : {}),
                  projectId: 'rebalance-project',
                  event: { name: 'rebalance_probe', properties: { seq } },
                }),
              })),
            });
            startWorker(0);
            await waitUntil(async () => (await redis.llen(traceKey)) >= 20);
            for (let worker = 1; worker < workers; worker++) {
              startWorker(worker);
            }
            await waitUntil(async () => {
              const offsets = await admin.fetchOffsets({
                groupId: topic,
                topics: [topic],
              });
              return offsets[0]?.partitions[0]?.offset === String(INPUT_COUNT);
            });
            for (const child of children) {
              child.kill('SIGTERM');
            }
            await waitUntil(async () =>
              children.every((child) => child.exitCode !== null)
            );
            for (const child of children) {
              expect(await child.exited).toBe(0);
            }
            const buffer = new EventBuffer(
              bufferDepsWithCh(
                ch,
                testCoreConfig({ clickhouseClustered: false })
              )
            );
            await buffer.processBuffer();
            const rows = await (
              await ch.query({
                query:
                  'SELECT count() rows, uniqExact(id) ids, uniqExact(properties.seq) sequences FROM events',
                format: 'JSONEachRow',
              })
            ).json<{ rows: string; ids: string; sequences: string }>();
            const trace = (await redis.lrange(traceKey, 0, -1)).map(
              (line) =>
                JSON.parse(line) as {
                  event?: string;
                  partition?: number;
                  offset?: string;
                }
            );
            const deliveries = trace.filter(
              (entry) => entry.offset !== undefined
            );
            const summary = {
              workers,
              producerIds,
              input: INPUT_COUNT,
              handlerCalls: deliveries.length,
              uniqueDeliveries: new Set(
                deliveries.map((entry) => `${entry.partition}:${entry.offset}`)
              ).size,
              rebalances: trace.filter((entry) => entry.event === 'rebalance')
                .length,
              rows: Number(rows[0]?.rows),
              ids: Number(rows[0]?.ids),
              sequences: Number(rows[0]?.sequences),
            };
            if (process.env.KAFKA_REBALANCE_RESULTS) {
              await Bun.write(
                `${process.env.KAFKA_REBALANCE_RESULTS}/${workers}-${producerIds ? 'producer' : 'legacy'}.json`,
                JSON.stringify(
                  { summary, trace, logs: await Promise.all(logs) },
                  null,
                  2
                )
              );
            }
            expect(summary.rebalances).toBeGreaterThan(0);
            // Assert actual repeat deliveries, not just a quiet startup with correct counts.
            expect(summary.handlerCalls).toBeGreaterThan(INPUT_COUNT);
            expect(summary.uniqueDeliveries).toBe(INPUT_COUNT);
            expect(summary.rows).toBe(INPUT_COUNT);
            expect(summary.ids).toBe(INPUT_COUNT);
            expect(summary.sequences).toBe(INPUT_COUNT);
          } finally {
            for (const child of children) {
              if (child.exitCode === null) {
                child.kill('SIGKILL');
              }
            }
            await Promise.all(children.map((child) => child.exited));
            await producer.disconnect();
            await admin.deleteGroups([topic]).catch(() => undefined);
            await admin
              .deleteTopics({ topics: [topic] })
              .catch(() => undefined);
            await admin.disconnect();
            await ch.close();
            await maintenance.command({
              query: `DROP DATABASE IF EXISTS ${database}`,
            });
            await maintenance.close();
            await redis.del(traceKey);
          }
        },
        DEADLINE_MS * 2
      );
    }
  }
);
