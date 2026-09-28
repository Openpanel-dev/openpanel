// The session lifecycle collectors, moved from apps/worker/src/metrics.ts onto
// core's one registry. Names, labels and buckets are V1's; the worker-side
// copies die with apps/worker (P9). The ingest-side `sessions_started_total`
// lives with the ingest path (modules/ingest/src/ingest.metrics.ts); the three
// at-scrape gauges joined this file at M9-002 — see
// `registerSessionScrapeMetrics` at the bottom.

import client from 'prom-client';
import { registry } from '../../../metrics';

// V1's key names, unchanged (apps/worker/src/metrics.ts).
const SESSION_PROJECTS_KEY = 'session:projects';

/**
 * The slice of the cache client the gauges use. `multi` is V1's, and it is
 * batching rather than a transaction — the ADR-006 swap replaces it with
 * `Promise.all` over Bun's auto-pipelining when packages/redis moves.
 */
export interface SessionMetricsRedis {
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  multi(): {
    zcard(key: string): unknown;
    get(key: string): unknown;
    exec(): Promise<[Error | null, unknown][] | null>;
  };
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const sessionEndsEnqueued = new client.Counter({
  name: 'session_ends_enqueued_total',
  help: 'session_end jobs pushed onto the sessions queue, by trigger source',
  labelNames: ['source'], // 'boundary' | 'reaper'
  registers: [registry],
});

export const sessionEndsEmitted = new client.Counter({
  name: 'session_ends_emitted_total',
  help: 'session_end events actually written (post-idempotency claim)',
  registers: [registry],
});

export const sessionEndsSkipped = new client.Counter({
  name: 'session_ends_skipped_total',
  help: 'session_end jobs that ran but did not emit, by reason',
  labelNames: ['reason'], // 'not_found' | 'already_emitted' | 'extended_after_enqueue'
  registers: [registry],
});

export const sessionsReaped = new client.Counter({
  name: 'sessions_reaped_total',
  help: 'Sessions closed by the reaper, by trigger condition',
  labelNames: ['reason'], // 'deadman'
  registers: [registry],
});

export const sessionsReaperOrphans = new client.Counter({
  name: 'sessions_reaper_orphans_total',
  help: 'Reaper found a sorted-set entry whose session blob is missing. Non-zero usually means TTL mismatch.',
  labelNames: ['reason'], // 'deadman'
  registers: [registry],
});

export const sessionDurationOnClose = new client.Histogram({
  name: 'session_duration_ms_on_close',
  help: 'Duration of closed sessions (ms)',
  buckets: [
    SECOND_MS,
    10 * SECOND_MS,
    MINUTE_MS,
    5 * MINUTE_MS,
    15 * MINUTE_MS,
    30 * MINUTE_MS,
    HOUR_MS,
    DAY_MS,
  ],
  registers: [registry],
});

export const sessionEventsOnClose = new client.Histogram({
  name: 'session_events_on_close',
  help: 'Total events (event_count + screen_view_count) on session close',
  buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [registry],
});

export const sessionsVacuumed = new client.Counter({
  name: 'sessions_vacuumed_total',
  help: 'Sessions removed by the daily vacuum cron (catches blobs that cleanup() missed)',
  labelNames: ['reason'], // 'stale_blob' | 'missing_blob'
  registers: [registry],
});

/**
 * The three scrape-time session gauges, moved from apps/worker/src/metrics.ts.
 *
 * Registered by main.ts and ONLY where the role consumes queues: each scrape
 * costs one `ZCARD` and one `GET` per project, and ten api replicas exposing
 * them would multiply that Redis load for no new information
 * (TARGET_ARCHITECTURE §18).
 *
 * The client is injected rather than imported so core does not open a Redis
 * connection at import time — `main.ts` hands in `getRedisCache`.
 */
export function registerSessionScrapeMetrics(
  getRedis: () => SessionMetricsRedis,
  register: client.Registry = registry
): void {
  // `registers` explicitly, never prom-client's global default — see
  // jobs/jobs.metrics.ts.
  const registerOn = [register];

  new client.Gauge({
    name: 'sessions_active_total',
    help: 'Active sessions in Redis across all projects',
    registers: registerOn,
    async collect() {
      const redis = getRedis();
      const projectIds = await redis.smembers(SESSION_PROJECTS_KEY);
      if (projectIds.length === 0) {
        this.set(0);
        return;
      }
      const multi = redis.multi();
      for (const projectId of projectIds) {
        multi.zcard(`session:wallclock:${projectId}`);
      }
      const results = await multi.exec();
      let total = 0;
      for (const entry of results ?? []) {
        const count = Number(entry?.[1] ?? 0);
        if (Number.isFinite(count)) {
          total += count;
        }
      }
      this.set(total);
    },
  });

  new client.Gauge({
    name: 'sessions_projects_active',
    help: 'Projects with at least one active session',
    registers: registerOn,
    async collect() {
      this.set(await getRedis().scard(SESSION_PROJECTS_KEY));
    },
  });

  new client.Gauge({
    name: 'sessions_hwm_lag_ms',
    help: 'Max lag (ms) between wall-clock now and project event-time HWM, across all projects. Big number → queue lag or imports.',
    registers: registerOn,
    async collect() {
      const redis = getRedis();
      const projectIds = await redis.smembers(SESSION_PROJECTS_KEY);
      if (projectIds.length === 0) {
        this.set(0);
        return;
      }
      const multi = redis.multi();
      for (const projectId of projectIds) {
        multi.get(`session:hwm:${projectId}`);
      }
      const results = await multi.exec();
      const now = Date.now();
      let maxLag = 0;
      for (const entry of results ?? []) {
        const hwm = Number(entry?.[1] ?? 0);
        if (!Number.isFinite(hwm) || hwm <= 0) {
          continue;
        }
        maxLag = Math.max(maxLag, now - hwm);
      }
      this.set(maxLag);
    },
  });
}
