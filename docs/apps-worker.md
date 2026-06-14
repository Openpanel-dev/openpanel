# Worker: Background Processing & Cron Jobs

The Worker (apps/worker) is OpenPanel's background job processor and cron scheduler, handling event ingestion, session management, data flushing, and scheduled analytics tasks. It consumes events from shared message queues populated by the API, applies business logic, batches data into ClickHouse, and executes timed housekeeping tasks.

## Key files

| File                           | Purpose                                              |
|--------------------------------|------------------------------------------------------|
| src/index.ts                   | HTTP server boot (BullBoard, metrics, healthcheck)  |
| src/boot-workers.ts            | Worker pool initialization & configuration           |
| src/boot-cron.ts               | Cron scheduler setup with repeating job patterns     |
| src/metrics.ts                 | Prometheus metrics: queue depth, buffer counts       |
| src/jobs/*.ts                  | Individual job handlers (events, sessions, crons)    |

## Architecture

```
API (producer)
  │
  ├─> eventsGroupQueues (GroupMQ, sharded by projectId)
  │   └─> Worker: incomingEvent()
  │       ├─> Parse, validate, enrich with geo/UA/session
  │       └─> createEvent() → eventBuffer
  │
  ├─> sessionsQueue (BullMQ)
  │   └─> Worker: sessionsJob()
  │       └─> createSessionEnd() → eventBuffer
  │
  ├─> cronQueue (BullMQ, repeating)
  │   └─> Worker: cronJob()
  │       ├─> flushEvents, flushProfiles, flushSessions, flushReplays
  │       ├─> salt rotation, project deletion, custom alerts
  │       └─> Buffers → ClickHouse
  │
  ├─> notificationQueue (BullMQ)
  │   └─> Worker: notificationJob()
  │       └─> POST to webhooks, Discord, Slack, or publish to app
  │
  ├─> miscQueue (BullMQ)
  │   └─> Worker: miscJob()
  │       └─> Trial-ending-soon emails
  │
  └─> importQueue (BullMQ)
      └─> Worker: importJob()
          └─> Multi-step Mixpanel/Umami import to ClickHouse
```

## Boot & Startup

### index.ts: HTTP Server
- Starts on `WORKER_PORT` (default 9999 in dev).
- Mounts **BullBoard** dashboard at `/` (unless `DISABLE_BULLBOARD=1`).
- Exposes `/metrics` for Prometheus scraping (prom-client).
- Exposes `/healthcheck` (returns `{ status: 'ok' }`).
- Calls `bootWorkers()` and `bootCron()` unless `DISABLE_WORKERS=1`.
- Initializes salts via `createInitialSalts()` (apps/worker/src/index.ts:25–82).

### boot-workers.ts: Worker Pool
Creates BullMQ/GroupMQ workers with configurable concurrency and queue filtering.

**Queue Selection & Sharding**
- `ENABLED_QUEUES` env var filters which queues to run (default: all).
- Event queues support **auto-partitioning** via `ENABLE_SHARD_DISTRIBUTION=true`:
  - Stateful set pod index (from `HOSTNAME`) determines which event shards this worker handles.
  - Shards are distributed round-robin across pods; remainder pods get +1 shard.
  - Example: 12 event shards, 5 pods → pods 0–4 get [3,3,2,2,2] shards respectively (apps/worker/src/boot-workers.ts:67–134).

**Per-Queue Concurrency**
- Set via `{QUEUE_NAME}_CONCURRENCY` env vars (e.g., `EVENTS_0_CONCURRENCY=32`).
- Default: `EVENT_JOB_CONCURRENCY` (10), `1` for others.
- BullBoard and queue event listeners track job success/failure and duration (apps/worker/src/boot-workers.ts:141–152, 276–337).

**Graceful Shutdown**
- Waits for cron queue to empty (60 sec timeout) before closing workers (apps/worker/src/boot-workers.ts:339–379).
- Listens to SIGTERM, SIGINT, uncaughtException, unhandledRejection.

### boot-cron.ts: Repeating Jobs
Manages repeating cron schedules via BullMQ's job scheduler. All jobs are cleared on startup, then recreated (apps/worker/src/boot-cron.ts:49–82).

| Job Type | Schedule | Trigger | Notes |
|----------|----------|---------|-------|
| `salt` | Daily (0 0 * * *) | New hash salt for device ID generation; old salt kept 1 day. |
| `deleteProjects` | Hourly (0 * * * *) | Soft-delete scheduled projects (where `deleteAt` ≤ now). |
| `flushEvents` | Every 5 sec (5000 ms) | Drain eventBuffer → ClickHouse. |
| `flushProfiles` | Every 60 sec | Drain profileBuffer → ClickHouse. |
| `flushSessions` | Every 10 sec | Drain sessionBuffer → ClickHouse. |
| `flushReplays` | Every 5 sec | Drain replayBuffer → ClickHouse. |
| `customAlerts` | Every 15 min (*/15 * * * *) | Evaluate threshold & anomaly rules; send notifications. |
| `ping` | Daily (0 0 * * *) | Only when `SELF_HOSTED` is set **and** `NODE_ENV === 'production'`; POST event count to api.openpanel.dev. |

## Job Handlers

### events.incoming-event.ts: Process Incoming Events

**Payload** (from API): projectId, event object, geo info, headers, device IDs, UA info (apps/worker/src/jobs/events.incoming-event.ts:47–58).

**Flow**
1. Parse URL, referrer, query params, user agent.
2. Extract profileId; check if timestamp is from the past.
3. **If server-side or old timestamp**: Use existing session (if any); create event only.
4. **If client-side & fresh**: 
   - Get or create session via `getSessionEnd()`.
   - Create `session_start` event (100 ms before main event).
   - Create main event with device/session ID.
   - Schedule `session_end` job for 30 min later (SESSION_TIMEOUT).

**Session Management** (session-handler.ts)
- Each session is a delayed job with unique ID: `sessionEnd:${projectId}:${deviceId}`.
- When a new event arrives for an existing device, the job delay is reset to 30 min (apps/worker/src/utils/session-handler.ts:27–47, 50–90).
- Profile IDs are merged in if event is identified (apps/worker/src/utils/session-handler.ts:71–83).

**Output**: Events written to eventBuffer (batched & flushed to ClickHouse).

### sessions.ts: Session End & Billing
Handler for sessionsQueue. Calls `createSessionEnd()` then updates organization event counts (for cloud deployments only; skipped in self-hosted).

### events.create-session-end.ts: Session End Event
- Fetches session from sessionBuffer (in-memory + Redis cache).
- Retrieves up to 500 events from that session (if notification rules exist).
- Checks threshold/anomaly notification rules (apps/worker/src/jobs/events.create-session-end.ts:111–137).
- Creates `session_end` event (1 sec after session.ended_at).

### notification.ts: Multi-Channel Notifications
Routes notifications to webhooks, Discord, Slack, or app in-memory cache.

**Types**
- `sendToApp=true`: Published to Redis pub/sub channel `notification:created`.
- `sendToEmail=true`: Currently a no-op.
- Via integration (webhook/Discord/Slack): Sends HTTP POST or uses SDK.

### misc.ts & misc.trail-ending-soon.ts: Trial Expiry
Sends trial-ending email (integration with `@openpanel/email`).

### import.ts: Data Import (Mixpanel, Umami)
Multi-phase import from external platforms into ClickHouse. Supports resumption across app restarts.

**Phases** (in order; can resume from any phase)
1. **Loading**: Stream raw events from provider, validate, batch to 5000, insert.
2. **Generating Session IDs**: Compute session IDs for events lacking them (provider-dependent).
3. **Creating Sessions**: Generate `session_start` and `session_end` events.
4. **Moving**: Transfer from staging to production tables in ClickHouse.
5. **Backfilling**: Reconstruct missing session end times.

**Batching & Yield**: Processes in daily chunks; yields to event loop every batch to prevent job staleness (apps/worker/src/jobs/import.ts:28–32, 116–138, 142–194).

### cron.ts: Cron Dispatcher
Routes based on job.data.type:

| Type | Handler |
|------|---------|
| `salt` | cron.salt.ts: Create new salt, delete old ones, clear cache. |
| `flushEvents` / `flushProfiles` / `flushSessions` / `flushReplays` | Call buffer.tryFlush() (apps/worker/src/jobs/cron.ts:22–32). |
| `deleteProjects` | cron.delete-projects.ts: Query for soft-deleted projects, purge from Postgres & ClickHouse. |
| `customAlerts` | cron.custom-alerts.ts: Evaluate all threshold & anomaly rules; trigger notifications. |
| `ping` | cron.ping.ts: POST event count to openpanel.dev (self-hosted telemetry). |

### cron.custom-alerts.ts: Threshold & Anomaly Detection
Runs every 15 minutes. Locked to prevent concurrent execution (apps/worker/src/jobs/cron.custom-alerts.ts:63–66).

**Threshold Alerts**
- Queries report (conversion, funnel, or generic chart) for current interval.
- Compares against fixed threshold (`above` or `below`).
- Skips last partial period (cron every 15 min, so trailing bucket is in-progress) (apps/worker/src/jobs/cron.custom-alerts.ts:52–56).

**Anomaly Alerts**
- Uses Z-score to detect if current value is ±N std devs from historical mean.
- Confidence levels: 95%, 98%, 99% → Z-scores from constants.
- Uses 72-point history window (apps/worker/src/jobs/cron.custom-alerts.ts:397–555).

**Frequency Gating**
- Respects alert frequency (hourly, daily, weekly, monthly) → won't re-alert within that period.

**Notification Output**
- Creates `Notification` record in Postgres.
- Routes to integrations (webhook, Discord, Slack) or in-app via pub/sub.
- Includes dashboard link, timestamp, project name (apps/worker/src/jobs/cron.custom-alerts.ts:166–227).

## Queues: GroupMQ vs. BullMQ

### GroupMQ (Event Queues)
Used for high-throughput incoming event processing.

- **Driver**: Custom `groupmq` library (Catalog 1.1.1-next.2) over Redis.
- **Sharding**: Events grouped by projectId (or server request ID) → deterministic shard via SHA1 hash (packages/queue/src/queues.ts:22–27).
- **Auto-batching**: Can batch multiple events under one message if `AUTO_BATCH_SIZE` & `AUTO_BATCH_MAX_WAIT_MS` env vars set (packages/queue/src/queues.ts:148–175).
- **Ordering**: `ORDERING_DELAY_MS` ensures events from same group are processed in order (default 100 ms) (packages/queue/src/queues.ts:143–146).
- **Concurrency**: Each shard can have independent concurrency (e.g., `EVENTS_0_CONCURRENCY=32`).
- **Queue Cleanup**: Completed/failed jobs auto-removed (keepCompleted=0, keepFailed=0).

### BullMQ (Standard Queues)
Used for lower-throughput, task-based processing (sessions, crons, notifications, imports).

- **Redis-backed** queue with job persistence, retries, delays.
- **Job Options**: Default `removeOnComplete: 10` (keeps 10 recent successful jobs).
- **Import Queue**: `removeOnFail: 50` (keeps 50 failed imports for inspection); longer lockDuration (5 min) for stalled job detection.
- **Named Job IDs**: Some queues use deterministic job IDs (e.g., `sessionEnd:${projectId}:${deviceId}`) to deduplicate / reschedule (apps/worker/src/utils/session-handler.ts:12–13).

## Buffering & Batch Insertion into ClickHouse

Events are not inserted immediately; instead, they accumulate in **Buffers** (Redis lists) and flush periodically.

**Buffer Types** (`packages/db/src/buffers/*.ts`)
- **eventBuffer**: Events staged for ClickHouse `events` table.
- **sessionBuffer**: Sessions (includes device ID, browser, OS, referrer, duration, bounce flag).
- **profileBuffer**: User profiles (traits, custom attributes).
- **replayBuffer**: Session replays (for session recording features).
- **botBuffer**: Auto-detected bot/crawler events.

**Flush Mechanism** (BaseBuffer class)
- Triggered by cron (5–60 sec intervals) or manually on high cardinality (e.g., unique profiles).
- Lock-based to prevent concurrent flushes (60 sec TTL).
- Flow: Fetch list from Redis → Fetch missing records from ClickHouse → Insert batch → Trim list.
- Async inserts can be enabled via `BUFFER_ASYNC_INSERTS=1` (apps/packages/db/src/buffers/base-buffer.ts:93–100).
- Parallel ClickHouse inserts via `BUFFER_CH_INSERT_CONCURRENCY` (default 5) (apps/packages/db/src/buffers/base-buffer.ts:71–76).

**Observation Hooks** (for metrics)
- `flushObserver`: Observes flush success/error/lock/pause + timing.
- `addObserver`: Observes add() latency & skip reason (if any).
- Both feed Prometheus metrics (apps/worker/src/metrics.ts:17–25).

## Metrics (Prometheus)

Exported at `/metrics` endpoint on `WORKER_PORT`.

**Queue Metrics** (per queue: sessions, cron, notification, misc, import, + all event shards)
- `{queue_name}_active_count`: Jobs currently processing.
- `{queue_name}_delayed_count`: Jobs waiting for delay to expire.
- `{queue_name}_failed_count`: Permanent failures.
- `{queue_name}_completed_count`: Successfully processed.
- `{queue_name}_waiting_count`: Jobs in queue ready to process.

**Buffer Metrics** (eventBuffer, profileBuffer, botBuffer, sessionBuffer)
- `buffer_{name}_count`: Number of unprocessed records in Redis list.

**Job Duration Histogram** (event jobs only)
- `job_duration_ms`: Buckets [10ms, 25ms, 50ms, …, 30s].
- Labels: `name` (queue name), `status` (success/failed).

**Default Metrics** (prom-client)
- Node.js heap, GC, event loop lag, etc.

## How It Connects

### API → Worker
- API receives events at `/track` endpoint (apps/api/src/controllers/track.controller.ts:121–273).
- Routes event to appropriate event shard via `getEventsGroupQueueShard(groupId).add()` (apps/api/src/controllers/track.controller.ts:309–326).
- Sessions, notifications, and imports also enqueued from API handlers.

### Worker → ClickHouse
- Events flow through buffers, flushed by cron jobs.
- ClickHouse queries use custom query builder at `packages/db/src/clickhouse/query-builder.ts` (per .cursorrules).
- Session-end events trigger notification rule checks and alert generation.

### Worker → PostgreSQL (Prisma)
- Updates organization/project event counts (for billing).
- Marks imports as complete/failed.
- Creates notification records.
- Manages salts, projects, notification rules.

### Worker → Redis
- Buffers (event, session, profile, replay) stored as lists in Redis.
- Session job delays & rescheduling via Sessions queue.
- Pub/sub for in-app notifications.
- Cache invalidation (e.g., salt rotation clears `op:salt` key).

### Worker → External Integrations
- Webhooks, Discord, Slack notifications via HTTP POST.
- Trial emails via email service.
- Openpanel telemetry ping (self-hosted only).

## Configuration & Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `WORKER_PORT` | 3000 | HTTP server port (9999 in `pnpm testing`). |
| `DISABLE_WORKERS` | unset | If set, skip worker/cron boot. |
| `DISABLE_BULLBOARD` | unset | If set, hide BullBoard dashboard. |
| `ENABLED_QUEUES` | all | Comma-separated queue names (e.g., `cron,notification` to run only those). |
| `ENABLE_SHARD_DISTRIBUTION` | false | Auto-partition event shards across Kubernetes stateful set pods. |
| `TOTAL_POD` | 1 | Number of worker pods (required for shard distribution). |
| `EVENTS_GROUP_QUEUES_SHARDS` | 1 | Number of event queue shards. |
| `EVENT_JOB_CONCURRENCY` | 10 | Default concurrency for event workers. |
| `EVENT_BLOCKING_TIMEOUT_SEC` | 1 | GroupMQ blocking timeout per poll. |
| `ORDERING_DELAY_MS` | 100 | Delay between consecutive messages in same group (event ordering). |
| `AUTO_BATCH_SIZE` | 0 (disabled) | Max events per auto-batch in GroupMQ. |
| `AUTO_BATCH_MAX_WAIT_MS` | 0 (disabled) | Max wait time before flushing auto-batch. |
| `IMPORT_BATCH_SIZE` | 5000 | Events per batch during import phase. |
| `BUFFER_ASYNC_INSERTS` | unset | Enable async inserts in ClickHouse (fire-and-forget). |
| `BUFFER_CH_INSERT_CONCURRENCY` | 5 | Parallel ClickHouse inserts per flush. |
| `SELF_HOSTED` | unset | If true, skip cloud-only tasks (billing, ping). |
| `DISABLE_PING` | unset | If set, skip telemetry ping. |
| `NODE_ENV` | unset | Set to `production` to enable queue logging & metrics. |

**Concurrency per Queue**
- `SESSIONS_CONCURRENCY` (default 1)
- `CRON_CONCURRENCY` (default 1)
- `NOTIFICATION_CONCURRENCY` (default 1)
- `MISC_CONCURRENCY` (default 1)
- `IMPORT_CONCURRENCY` (default 1)
- `EVENTS_0_CONCURRENCY`, `EVENTS_1_CONCURRENCY`, etc. (default `EVENT_JOB_CONCURRENCY`).

## Running Locally

```bash
# Terminal 1: API + Worker (parallel)
pnpm dev

# Terminal 2: Dashboard
pnpm --filter start with-env vite dev --port 3000

# View BullBoard (worker dashboard)
open http://localhost:9999

# View worker metrics
curl http://localhost:9999/metrics | grep job_duration_ms

# Tail worker logs
tail -f logs/worker.log  # If logging configured
```

To test with a specific queue only:
```bash
ENABLED_QUEUES=cron,notification pnpm --filter @openpanel/worker dev
```

To scale event shards locally (simulate multi-pod):
```bash
EVENTS_GROUP_QUEUES_SHARDS=4 pnpm dev
```

## Gotchas

1. **Session ID Deduplication**: Session end jobs are keyed by `sessionEnd:${projectId}:${deviceId}`. If two events arrive for the same device, the first job's delay is reset (not created twice). This ensures proper 30-min idle timeout per device.

2. **Ordering Delay**: GroupMQ's `ORDERING_DELAY_MS` ensures events from the same group (project) are processed in order but introduces latency. In high-throughput scenarios, increase GroupMQ concurrency per shard rather than reducing this delay.

3. **Buffer Flush Locking**: Concurrent flush attempts are prevented by a Redis lock with 60 sec TTL. If a flush hangs (e.g., ClickHouse query slow), subsequent flushes wait or timeout. Monitor for `lock:eventBuffer` keys in Redis.

4. **Timestamp Handling**: Events with `__timestamp` property older than 15 min are marked `isTimestampFromThePast=true`, preventing new session creation (use existing session instead). This avoids false session fragmentation from backdated events.

5. **Custom Alerts Timeout**: Cron alert evaluation has a 60 sec query timeout. Slow report queries (especially funnels with large datasets) may fail silently. Optimize report filters if alerts timeout frequently.

6. **Import Resume**: If an import job crashes, it resumes from the last completed step + batch. However, phases must run in order; earlier phases cannot be skipped. Use `currentStep` and `currentBatch` in the import record to debug stalls.

7. **Self-Hosted vs. Cloud**: Event count updates (for billing) are skipped if `SELF_HOSTED=true`. Trial email jobs still run; ignore if your instance has no Stripe integration.

## Unverified / TODO

- [ ] Exact ClickHouse schema for events, sessions, profiles tables (assumed per @openpanel/db).
- [ ] Query-builder usage patterns in flush() methods (assumed as per .cursorrules).
- [ ] Full error-handling chain for failed imports (may require manual database cleanup).
- [ ] Metrics export format in detail (assumed Prometheus standard).
- [ ] Load-testing results for event throughput per shard.
- [ ] Notification rule evaluation performance (anomaly detection with large history).
