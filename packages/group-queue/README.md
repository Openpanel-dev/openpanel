# GroupMQ - Redis Group Queue

A fast, reliable Redis-backed per-group FIFO queue for Node + TypeScript with guaranteed job ordering and parallel processing across groups.

## Install

```bash
npm i @openpanel/group-queue ioredis zod bullmq
```

## Quick start

```ts
import Redis from 'ioredis';
import { Queue, Worker } from '@openpanel/group-queue';

const redis = new Redis('redis://127.0.0.1:6379');

const queue = new Queue({ 
  redis, 
  namespace: 'orders',  // Will be prefixed with 'groupmq:'
  jobTimeoutMs: 30_000  // How long before job times out
});

await queue.add({
  groupId: 'user:42',
  payload: { type: 'charge', amount: 999 },
  orderMs: Date.now(),    // or event.createdAtMs
  maxAttempts: 5,
});

const worker = new Worker({
  redis,
  namespace: 'orders',
  jobTimeoutMs: 30_000,   // Must match queue timeout
  handler: async (job) => {
    // Process the job
    console.log(`Processing:`, job.payload);
  },
});

worker.run();
```

## Key Features

### Simplified API
- **No more polling vs blocking confusion** - Always uses efficient blocking operations
- **Clear naming** - `jobTimeoutMs` instead of confusing `visibilityTimeoutMs`
- **Automatic namespace prefixing** - All namespaces get `groupmq:` prefix to avoid conflicts
- **Unified configuration** - No duplicate options between Queue and Worker

### Performance & Reliability
- **1 in-flight job per group** via per-group locks
- **Parallel processing** across different groups  
- **FIFO ordering** within each group by `orderMs` with stable tiebreaking
- **At-least-once delivery** with configurable retries and backoff
- **Efficient blocking operations** - no wasteful polling

### Queue Options
```ts
type QueueOptions = {
  redis: Redis;
  namespace: string;                    // Required, gets 'groupmq:' prefix
  jobTimeoutMs?: number;               // Job processing timeout (default: 30s)
  maxAttempts?: number;                // Default max attempts (default: 3)
  reserveScanLimit?: number;           // Ready groups scan limit (default: 20)
  orderingDelayMs?: number;            // Delay for late events (default: 0)
}
```

### Worker Options
```ts
type WorkerOptions<T> = {
  redis: Redis;
  namespace: string;                   // Required, gets 'groupmq:' prefix  
  name?: string;                       // Worker name for logging
  handler: (job: ReservedJob<T>) => Promise<void>;
  jobTimeoutMs?: number;              // Job processing timeout (default: 30s)
  heartbeatMs?: number;               // Heartbeat interval (default: jobTimeoutMs/3)
  onError?: (err: unknown, job?: ReservedJob<T>) => void;
  maxAttempts?: number;               // Max retry attempts (default: 3)
  backoff?: BackoffStrategy;          // Retry backoff function
  enableCleanup?: boolean;            // Periodic cleanup (default: true)
  cleanupIntervalMs?: number;         // Cleanup frequency (default: 60s)
  blockingTimeoutSec?: number;        // Blocking timeout (default: 5s)
  orderingDelayMs?: number;           // Delay for late events (default: 0)
}
```

## Graceful Shutdown

```ts
// Stop worker gracefully - waits for current job to finish
await worker.close(gracefulTimeoutMs);

// Wait for queue to be empty
const isEmpty = await queue.waitForEmpty(timeoutMs);

// Recover groups that might be stuck due to ordering delays
const recoveredCount = await queue.recoverDelayedGroups();
```

## Additional Methods

### Queue Status
```ts
// Get job counts by state
const counts = await queue.getCounts();
// { active: 5, waiting: 12, delayed: 3, total: 20, uniqueGroups: 8 }

// Get unique groups that have jobs
const groups = await queue.getUniqueGroups();
// ['user:123', 'user:456', 'order:789']

// Get count of unique groups
const groupCount = await queue.getUniqueGroupsCount();
// 8

// Get job IDs by state
const jobs = await queue.getJobs();
// { active: ['1', '2'], waiting: ['3', '4'], delayed: ['5'] }
```

### Worker Status
```ts
// Check if worker is processing a job
const isProcessing = worker.isProcessing();

// Get current job info (if any)
const currentJob = worker.getCurrentJob();
// { job: ReservedJob, processingTimeMs: 1500 } | null
```

## CLI Monitor

A built-in CLI tool for monitoring queue status in real-time:

```bash
# Install dependencies first
npm install

# Monitor a queue (basic usage)
npm run monitor -- --namespace orders

# Custom Redis URL and poll interval  
npm run monitor -- --namespace orders --redis-url redis://localhost:6379 --interval 2000

# Show help
npm run monitor -- --help
```

The CLI displays:
- Real-time job counts (active, waiting, delayed, total)
- Number of unique groups
- List of active groups
- Updates every second (configurable)

Example output:
```
╔════════════════════════════════════════════════════════════════════╗
║                          GroupMQ Monitor                           ║
╚════════════════════════════════════════════════════════════════════╝

Namespace: orders
Poll Interval: 1000ms
Last Update: 2:30:45 PM

Job Counts:
  Active:           3
  Waiting:         12
  Delayed:          0
  Total:           15

Groups:
  Unique Groups:    8

Active Groups:
  ├─ user:123
  ├─ user:456
  ├─ order:789
  └─ payment:abc
```

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
