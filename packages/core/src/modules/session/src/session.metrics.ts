// The session lifecycle collectors, moved from apps/worker/src/metrics.ts
// (M7-001) onto core's one registry. Names, labels and buckets are V1's; the
// worker-side copies die with apps/worker (P9). The at-scrape gauges
// (`sessions_active_total`, `sessions_projects_active`, `sessions_hwm_lag_ms`)
// and the ingest-side `sessions_started_total` stay with the ingest path.

import client from 'prom-client';
import { registry } from '../../../metrics';

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
