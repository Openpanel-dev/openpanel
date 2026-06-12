import {
  botBuffer,
  eventBuffer,
  groupBuffer,
  profileBackfillBuffer,
  profileBuffer,
  replayBuffer,
  sessionBuffer,
} from '@openpanel/db';
import { cronQueue, eventsGroupQueues, sessionsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import client from 'prom-client';

const Registry = client.Registry;

export const register = new Registry();

const queues = [sessionsQueue, cronQueue, ...eventsGroupQueues];

export const eventsGroupJobDuration = new client.Histogram({
  name: 'job_duration_ms',
  help: 'Duration of job processing (in ms)',
  labelNames: ['name', 'status'],
  buckets: [10, 25, 50, 100, 250, 500, 750, 1000, 2000, 5000, 10_000, 30_000],
});

register.registerMetric(eventsGroupJobDuration);

// Kafka event messages reprocessed (same offset redelivered outside a
// rebalance). Should stay ~0. A sustained non-zero rate means the consumer is
// re-delivering messages it already handled — an offset-handling/duplicate bug.
export const kafkaReprocessedTotal = new client.Counter({
  name: 'kafka_events_reprocessed_total',
  help: 'Kafka event messages reprocessed (offset redelivered outside a rebalance)',
  labelNames: ['partition'],
});

register.registerMetric(kafkaReprocessedTotal);

queues.forEach((queue) => {
  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[{}]/g, '')}_active_count`,
      help: 'Active count',
      async collect() {
        const metric = await queue.getActiveCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[{}]/g, '')}_delayed_count`,
      help: 'Delayed count',
      async collect() {
        if ('getDelayedCount' in queue) {
          const metric = await queue.getDelayedCount();
          this.set(metric);
        } else {
          this.set(0);
        }
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[{}]/g, '')}_failed_count`,
      help: 'Failed count',
      async collect() {
        const metric = await queue.getFailedCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[{}]/g, '')}_completed_count`,
      help: 'Completed count',
      async collect() {
        const metric = await queue.getCompletedCount();
        this.set(metric);
      },
    })
  );

  register.registerMetric(
    new client.Gauge({
      name: `${queue.name.replace(/[{}]/g, '')}_waiting_count`,
      help: 'Waiting count',
      async collect() {
        const metric = await queue.getWaitingCount();
        this.set(metric);
      },
    })
  );
});

// -----------------------------------------------------------------------------
// Buffer metrics
// -----------------------------------------------------------------------------

const allBuffers = [
  eventBuffer,
  profileBuffer,
  botBuffer,
  sessionBuffer,
  replayBuffer,
  groupBuffer,
  profileBackfillBuffer,
];

// Ground-truth LLEN of each buffer's main list. O(1) — no shadow counter.
for (const buf of allBuffers) {
  register.registerMetric(
    new client.Gauge({
      name: `buffer_${buf.name.replace(/-/g, '_')}_count`,
      help: 'Buffer size (LLEN of the Redis list)',
      async collect() {
        try {
          this.set(await buf.getBufferSize());
        } catch {
          // ignore — scrape continues
        }
      },
    })
  );
}

// Number of events sitting in event-buffer's in-process micro-batch (pre-Redis).
// Other buffers don't have a local layer.
register.registerMetric(
  new client.Gauge({
    name: 'buffer_event_pending_local_count',
    help: 'Events in event-buffer process-local micro-batch (not yet in Redis)',
    collect() {
      try {
        this.set(eventBuffer.getPendingLocalCount());
      } catch {
        // ignore
      }
    },
  })
);

// ---- Flush metrics (populated via flushObserver hooks) ----

const flushDuration = new client.Histogram({
  name: 'buffer_flush_duration_ms',
  help: 'Wall time of a tryFlush call, including lock acquisition',
  labelNames: ['buffer', 'result', 'trigger'],
  buckets: [
    5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
  ],
});
register.registerMetric(flushDuration);

const flushTotal = new client.Counter({
  name: 'buffer_flush_total',
  help: 'Count of tryFlush invocations by result (success/error/locked/paused) and trigger (add/cron)',
  labelNames: ['buffer', 'result', 'trigger'],
});
register.registerMetric(flushTotal);

const flushRowsTotal = new client.Counter({
  name: 'buffer_flush_rows_total',
  help: 'Rows drained from the buffer per flush (sum)',
  labelNames: ['buffer'],
});
register.registerMetric(flushRowsTotal);

// Per-phase Redis op timing on the flush hot path.
const redisOpDurationMs = new client.Histogram({
  name: 'buffer_redis_op_duration_ms',
  help: 'Duration of a Redis op during flush',
  labelNames: ['buffer', 'op'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});
register.registerMetric(redisOpDurationMs);

const chInsertDurationMs = new client.Histogram({
  name: 'buffer_ch_insert_duration_ms',
  help: 'Duration of the ClickHouse insert(s) inside a single flush',
  labelNames: ['buffer'],
  buckets: [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
  ],
});
register.registerMetric(chInsertDurationMs);

// CH SELECT latency inside a flush (e.g. profile-buffer's fetch-existing
// profiles for merge). Separated from ch_insert because for some buffers
// the SELECT dominates total flush time. Only populated by buffers that
// actually read CH inside the flush path.
const chFetchDurationMs = new client.Histogram({
  name: 'buffer_ch_fetch_duration_ms',
  help: 'Duration of CH SELECT(s) inside a single flush (e.g. profile merge fetch)',
  labelNames: ['buffer'],
  buckets: [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
  ],
});
register.registerMetric(chFetchDurationMs);

const flushLlenAtStart = new client.Histogram({
  name: 'buffer_flush_llen_at_start',
  help: 'LLEN observed at the start of a flush attempt',
  labelNames: ['buffer'],
  buckets: [
    0, 10, 100, 500, 1000, 5000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
    5_000_000,
  ],
});
register.registerMetric(flushLlenAtStart);

// ---- Add-path metrics ----

const addDurationMs = new client.Histogram({
  name: 'buffer_add_duration_ms',
  help: 'Duration of a single add() call (per-event ingest path)',
  labelNames: ['buffer'],
  buckets: [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});
register.registerMetric(addDurationMs);

const addTotal = new client.Counter({
  name: 'buffer_add_total',
  help: 'Total add() calls per buffer that actually enqueued (excludes skipped).',
  labelNames: ['buffer'],
});
register.registerMetric(addTotal);

const addSkippedTotal = new client.Counter({
  name: 'buffer_add_skipped_total',
  help: 'add() calls that short-circuited (no enqueue). Reason: cached, etc.',
  labelNames: ['buffer', 'reason'],
});
register.registerMetric(addSkippedTotal);

for (const buf of allBuffers) {
  buf.flushObserver = (obs) => {
    flushTotal.inc({
      buffer: obs.buffer,
      result: obs.result,
      trigger: obs.trigger,
    });
    flushDuration.observe(
      { buffer: obs.buffer, result: obs.result, trigger: obs.trigger },
      obs.totalMs
    );

    if (obs.llenAtStart != null) {
      flushLlenAtStart.observe({ buffer: obs.buffer }, obs.llenAtStart);
    }

    if (obs.rowsProcessed != null && obs.rowsProcessed > 0) {
      flushRowsTotal.inc({ buffer: obs.buffer }, obs.rowsProcessed);
    }

    if (obs.phases?.lrangeMs != null) {
      redisOpDurationMs.observe(
        { buffer: obs.buffer, op: 'lrange' },
        obs.phases.lrangeMs
      );
    }
    if (obs.phases?.trimMs != null) {
      redisOpDurationMs.observe(
        { buffer: obs.buffer, op: 'trim' },
        obs.phases.trimMs
      );
    }
    if (obs.phases?.chFetchMs != null) {
      chFetchDurationMs.observe({ buffer: obs.buffer }, obs.phases.chFetchMs);
    }
    if (obs.phases?.chInsertMs != null) {
      chInsertDurationMs.observe({ buffer: obs.buffer }, obs.phases.chInsertMs);
    }
  };

  buf.addObserver = (obs) => {
    if (obs.skipped) {
      addSkippedTotal.inc({
        buffer: obs.buffer,
        reason: obs.skipReason ?? 'unknown',
      });
      // Don't pollute add-latency histogram with no-op fast paths
      return;
    }
    addTotal.inc({ buffer: obs.buffer });
    addDurationMs.observe({ buffer: obs.buffer }, obs.durationMs);
  };
}

// Note: `buffer_replay_count` is already registered by the allBuffers loop
// above (replayBuffer is in that list), so no standalone gauge here — a second
// registration with the same name throws and crashes the worker on boot.

// -----------------------------------------------------------------------
// Session lifecycle metrics (new session-buffer + reaper world)
// -----------------------------------------------------------------------

// Counters incremented at runtime by the session lifecycle code paths.

export const sessionsStarted = new client.Counter({
  name: 'sessions_started_total',
  help: 'session_start events emitted, by lifecycle kind',
  labelNames: ['kind'], // 'new' | 'boundary'
});
register.registerMetric(sessionsStarted);

export const sessionEndsEnqueued = new client.Counter({
  name: 'session_ends_enqueued_total',
  help: 'session_end jobs pushed onto the sessions queue, by trigger source',
  labelNames: ['source'], // 'boundary' | 'reaper'
});
register.registerMetric(sessionEndsEnqueued);

export const sessionEndsEmitted = new client.Counter({
  name: 'session_ends_emitted_total',
  help: 'session_end events actually written (post-idempotency claim)',
});
register.registerMetric(sessionEndsEmitted);

export const sessionEndsSkipped = new client.Counter({
  name: 'session_ends_skipped_total',
  help: 'session_end jobs that ran but did not emit, by reason',
  labelNames: ['reason'], // 'not_found' | 'already_emitted'
});
register.registerMetric(sessionEndsSkipped);

export const sessionsReaped = new client.Counter({
  name: 'sessions_reaped_total',
  help: 'Sessions closed by the reaper, by trigger condition',
  labelNames: ['reason'], // 'event-time' | 'deadman'
});
register.registerMetric(sessionsReaped);

export const sessionsReaperOrphans = new client.Counter({
  name: 'sessions_reaper_orphans_total',
  help: 'Reaper found a sorted-set entry whose session blob is missing. Non-zero usually means TTL mismatch.',
  labelNames: ['reason'], // 'event-time' | 'deadman'
});
register.registerMetric(sessionsReaperOrphans);

export const sessionDurationOnClose = new client.Histogram({
  name: 'session_duration_ms_on_close',
  help: 'Duration of closed sessions (ms)',
  buckets: [
    1000, // 1s
    10_000, // 10s
    60_000, // 1m
    5 * 60_000, // 5m
    15 * 60_000, // 15m
    30 * 60_000, // 30m
    60 * 60_000, // 1h
    24 * 60 * 60_000, // 24h
  ],
});
register.registerMetric(sessionDurationOnClose);

export const sessionEventsOnClose = new client.Histogram({
  name: 'session_events_on_close',
  help: 'Total events (event_count + screen_view_count) on session close',
  buckets: [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
});
register.registerMetric(sessionEventsOnClose);

// Gauges polled at scrape time. The active-sessions gauge does one ZCARD
// per project — cheap individually, fine for hundreds of projects.

register.registerMetric(
  new client.Gauge({
    name: 'sessions_active_total',
    help: 'Active sessions in Redis across all projects',
    async collect() {
      const redis = getRedisCache();
      const projectIds = await redis.smembers('session:projects');
      if (projectIds.length === 0) {
        this.set(0);
        return;
      }
      const multi = redis.multi();
      for (const pid of projectIds) {
        multi.zcard(`session:wallclock:${pid}`);
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
  })
);

register.registerMetric(
  new client.Gauge({
    name: 'sessions_projects_active',
    help: 'Projects with at least one active session',
    async collect() {
      const redis = getRedisCache();
      this.set(await redis.scard('session:projects'));
    },
  })
);

register.registerMetric(
  new client.Gauge({
    name: 'sessions_hwm_lag_ms',
    help: 'Max lag (ms) between wall-clock now and project event-time HWM, across all projects. Big number → queue lag or imports.',
    async collect() {
      const redis = getRedisCache();
      const projectIds = await redis.smembers('session:projects');
      if (projectIds.length === 0) {
        this.set(0);
        return;
      }
      const multi = redis.multi();
      for (const pid of projectIds) {
        multi.get(`session:hwm:${pid}`);
      }
      const results = await multi.exec();
      const now = Date.now();
      let maxLag = 0;
      for (const entry of results ?? []) {
        const hwm = Number(entry?.[1] ?? 0);
        if (!Number.isFinite(hwm) || hwm <= 0) {
          continue;
        }
        const lag = now - hwm;
        if (lag > maxLag) {
          maxLag = lag;
        }
      }
      this.set(maxLag);
    },
  })
);

export const sessionsVacuumed = new client.Counter({
  name: 'sessions_vacuumed_total',
  help: 'Sessions removed by the daily vacuum cron (catches blobs that cleanup() missed)',
  labelNames: ['reason'], // 'stale_blob' | 'missing_blob'
});
register.registerMetric(sessionsVacuumed);
