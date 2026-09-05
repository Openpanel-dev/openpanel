import { expect, test } from 'bun:test';
import client from 'prom-client';
import { queues } from '../jobs.registry';
import { type CountableQueue, registerQueueMetrics } from './jobs.metrics';
import { queueKey } from './naming';

const COUNT_SUFFIXES = ['active', 'delayed', 'failed', 'completed', 'waiting'];

function fakeQueue(name: string, value: number): CountableQueue {
  return {
    name,
    getActiveCount: () => Promise.resolve(value),
    getDelayedCount: () => Promise.resolve(value),
    getFailedCount: () => Promise.resolve(value),
    getCompletedCount: () => Promise.resolve(value),
    getWaitingCount: () => Promise.resolve(value),
  };
}

test('five gauges per queue, named from the Redis key exactly as V1 named them', () => {
  const register = new client.Registry();
  registerQueueMetrics(
    Object.values(queues).map((definition) => fakeQueue(definition.name, 0)),
    register
  );

  const names = register.getMetricsAsArray().map((metric) => metric.name);
  expect(names).toHaveLength(
    Object.keys(queues).length * COUNT_SUFFIXES.length
  );
  for (const suffix of COUNT_SUFFIXES) {
    expect(names).toContain(`sessions_${suffix}_count`);
    expect(names).toContain(`cron_${suffix}_count`);
    // ADR-005 acceptance note: the registry key stays `cohortCompute`, so the
    // series name does too.
    expect(names).toContain(`cohortCompute_${suffix}_count`);
  }
});

test('cluster braces are stripped from the series name, not from the queue key', () => {
  const register = new client.Registry();
  const key = queueKey('cron', { cluster: true });
  expect(key).toBe('{cron}');

  registerQueueMetrics([fakeQueue(key, 0)], register);

  expect(register.getMetricsAsArray().map((metric) => metric.name)).toContain(
    'cron_active_count'
  );
});

test('a QUEUE_NAMESPACE key stays a legal metric name', () => {
  const register = new client.Registry();
  const key = queueKey('cron', { namespace: 'proof-1' });
  expect(key).toBe('cron-proof-1');

  registerQueueMetrics([fakeQueue(key, 0)], register);

  // `-` is not legal in a prom-client name; an unsanitised key throws at
  // construction and takes boot down.
  expect(register.getMetricsAsArray().map((metric) => metric.name)).toContain(
    'cron_proof_1_active_count'
  );
});

test('a gauge whose Redis read throws does not fail the scrape', async () => {
  const register = new client.Registry();
  const broken: CountableQueue = {
    ...fakeQueue('sessions', 7),
    getActiveCount: () => Promise.reject(new Error('redis down')),
  };
  registerQueueMetrics([broken], register);

  const text = await register.metrics();
  expect(text).toContain('sessions_waiting_count 7');
});
