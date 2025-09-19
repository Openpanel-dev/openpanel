# redis-group-queue

Tiny Redis-backed per-group FIFO queue for Node + TypeScript.

## Install

```bash
npm i redis-group-queue ioredis zod
```

## Quick start

```ts
import Redis from 'ioredis';
import { Queue, Worker } from 'redis-group-queue';

const redis = new Redis('redis://127.0.0.1:6379');
const namespace = 'orders';

const queue = new Queue({ redis, namespace, visibilityTimeoutMs: 20_000 });

await queue.add({
  groupId: 'user:42',
  payload: { type: 'charge', amount: 999 },
  orderMs: Date.now(),    // or event.createdAtMs
  maxAttempts: 5,
});

const worker = new Worker({
  redis,
  namespace,
  visibilityTimeoutMs: 20_000,
  handler: async (job) => {
    // do work
  },
});

worker.run();
```

## Guarantees

- 1 in-flight job per group via a per-group lock (visibility timeout)
- Parallelism across groups
- FIFO per group by your field (`orderMs`) with stable tiebreak via monotonic sequence
- At-least-once delivery (use idempotency in handlers)
- Configurable retries + backoff that do not allow later jobs to overtake

## Testing

Requires a local Redis at `127.0.0.1:6379` (no auth).

```bash
npm i
npm run build
npm test
```

Optionally:

```bash
docker run --rm -p 6379:6379 redis:7
```
