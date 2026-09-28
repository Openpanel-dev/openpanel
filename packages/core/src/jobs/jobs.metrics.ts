// The queue-side collectors, on the one core registry.
//
// Three deliberate differences from the metric set this replaces, written up
// for dashboard owners in `packages/core/docs/OPS_GRAFANA_MIGRATION.md`:
//
// 1. Registers the five `<queue>_*_count` gauges for all seven BullMQ
// queues, not just two — ten new series appear; none of the existing ten
// changes. 2. They register only where the role consumes (main.ts), because
// each gauge is one Redis round trip per scrape and ten api replicas
// exposing them would multiply that for no new information. 3. A gauge whose
// Redis read throws is skipped rather than failing the whole scrape, so one
// Redis blip does not turn into a 500 on /metrics and a gap in every panel;
// core's buffer gauges already swallow the same way
// (buffers/buffer.metrics.ts).

import type { Queue as BullQueue } from 'bullmq';
import client from 'prom-client';
import { registry } from '../metrics';

const JOB_DURATION_BUCKETS_MS = [
  10, 25, 50, 100, 250, 500, 750, 1000, 2000, 5000, 10_000, 30_000,
];

// A Redis queue key is not a legal prom-client metric name: `{cron}`'s braces
// and a `QUEUE_NAMESPACE`'s `-` are both rejected by prom-client, which throws
// at construction and takes boot down. The `_` substitution is the namespace
// half, and it changes nothing for a deployment that sets no namespace.
const QUEUE_BRACES = /[{}]/g;
const NON_METRIC_NAME_CHARS = /[^a-zA-Z0-9_]/g;

function metricPrefix(queueName: string): string {
  return queueName
    .replace(QUEUE_BRACES, '')
    .replace(NON_METRIC_NAME_CHARS, '_');
}

/**
 * FAILURE-ONLY, deliberately: every percentile ever computed from it is a
 * percentile of failures. Success timings, if wanted, get a NEW series name —
 * emitting them here silently rewrites every existing panel.
 */
export const jobDurationMs = new client.Histogram({
  name: 'job_duration_ms',
  help: 'Duration of job processing (in ms)',
  labelNames: ['name', 'status'],
  buckets: JOB_DURATION_BUCKETS_MS,
  registers: [registry],
});

/** The `Queue` surface these gauges need — narrowed so a test can fake it. */
export interface CountableQueue {
  name: string;
  getActiveCount(): Promise<number>;
  getDelayedCount(): Promise<number>;
  getFailedCount(): Promise<number>;
  getCompletedCount(): Promise<number>;
  getWaitingCount(): Promise<number>;
}

const COUNTS: {
  suffix: string;
  help: string;
  read: (queue: CountableQueue) => Promise<number>;
}[] = [
  {
    suffix: 'active',
    help: 'Active count',
    read: (queue) => queue.getActiveCount(),
  },
  {
    suffix: 'delayed',
    help: 'Delayed count',
    read: (queue) => queue.getDelayedCount(),
  },
  {
    suffix: 'failed',
    help: 'Failed count',
    read: (queue) => queue.getFailedCount(),
  },
  {
    suffix: 'completed',
    help: 'Completed count',
    read: (queue) => queue.getCompletedCount(),
  },
  {
    suffix: 'waiting',
    help: 'Waiting count',
    read: (queue) => queue.getWaitingCount(),
  },
];

/**
 * Five scrape-time gauges per queue, named from the queue's Redis key. Call
 * once per process, only where the role consumes.
 *
 * `register` defaults to the one core registry; it is a parameter so a test
 * can assert on an isolated one.
 */
export function registerQueueMetrics(
  queues: (CountableQueue | BullQueue)[],
  register: client.Registry = registry
): void {
  for (const queue of queues as CountableQueue[]) {
    const prefix = metricPrefix(queue.name);
    for (const count of COUNTS) {
      // `registers` explicitly, never prom-client's global default: a gauge
      // constructed without it lands on `client.register` too, which is a
      // second registry by any other name.
      new client.Gauge({
        name: `${prefix}_${count.suffix}_count`,
        help: count.help,
        registers: [register],
        async collect() {
          try {
            this.set(await count.read(queue));
          } catch {
            // ignore — a Redis blip must not fail the whole scrape
          }
        },
      });
    }
  }
}
