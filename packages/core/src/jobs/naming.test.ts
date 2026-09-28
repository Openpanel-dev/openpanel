import { expect, test } from 'bun:test';
import { queues } from '../jobs.registry';
import { queueKey } from './naming';

// Byte-identity snapshot, mirroring `verification/golden/queue-keys/keys.json`
// — which the controller's `check.sh` independently recomputes from V1's
// `getQueueName`. Both sides pin the same 14 strings; a one-character drift
// orphans every queue in Redis (ADR-005 risk 4).
const GOLDEN_KEYS = [
  { name: 'cohortCompute', queueCluster: false, key: 'cohortCompute' },
  { name: 'cohortCompute', queueCluster: true, key: '{cohortCompute}' },
  { name: 'cron', queueCluster: false, key: 'cron' },
  { name: 'cron', queueCluster: true, key: '{cron}' },
  { name: 'gsc', queueCluster: false, key: 'gsc' },
  { name: 'gsc', queueCluster: true, key: '{gsc}' },
  { name: 'import', queueCluster: false, key: 'import' },
  { name: 'import', queueCluster: true, key: '{import}' },
  { name: 'insights', queueCluster: false, key: 'insights' },
  { name: 'insights', queueCluster: true, key: '{insights}' },
  { name: 'notification', queueCluster: false, key: 'notification' },
  { name: 'notification', queueCluster: true, key: '{notification}' },
  { name: 'sessions', queueCluster: false, key: 'sessions' },
  { name: 'sessions', queueCluster: true, key: '{sessions}' },
] as const;

test('every golden key is reproduced byte-for-byte', () => {
  const produced = GOLDEN_KEYS.map((row) => ({
    ...row,
    produced: queueKey(row.name, { cluster: row.queueCluster }),
  }));

  expect(produced.map((row) => row.produced)).toEqual(
    GOLDEN_KEYS.map((row) => row.key)
  );
});

test('the golden table covers exactly the queues the registry declares', () => {
  const golden = [...new Set(GOLDEN_KEYS.map((row) => row.name))].sort();

  expect(Object.keys(queues).sort()).toEqual(golden);
  // Registry key === Redis name for all seven, `cohortCompute` included
  // (ADR-005 acceptance note: no env rename).
  expect(
    Object.values(queues)
      .map((queue) => queue.name)
      .sort()
  ).toEqual(golden);
});

test('braces appear only under QUEUE_CLUSTER', () => {
  expect(queueKey('cron')).toBe('cron');
  expect(queueKey('cron', {})).toBe('cron');
  expect(queueKey('cron', { cluster: false })).toBe('cron');
  expect(queueKey('cron', { cluster: true })).toBe('{cron}');
});

// The `QUEUE_CLUSTER=off, namespace=set` cell is the one the plan left
// unspecified; ADR-005 says the snapshot is where it gets pinned. Braces are a
// Redis Cluster hash-tag concern, the namespace is an isolation concern, so
// they are independent: the namespace always applies, the braces only cluster.
test('the namespace always applies; only the braces are cluster-conditional', () => {
  expect(queueKey('cron', { namespace: 'wt3' })).toBe('cron-wt3');
  expect(queueKey('cron', { cluster: false, namespace: 'wt3' })).toBe(
    'cron-wt3'
  );
  expect(queueKey('cron', { cluster: true, namespace: 'wt3' })).toBe(
    '{cron-wt3}'
  );
  expect(queueKey('cron', { cluster: true, namespace: '' })).toBe('{cron}');
});
