import { registerBufferMetrics } from '@openpanel/core';
import {
  botBuffer,
  eventBuffer,
  groupBuffer,
  profileBackfillBuffer,
  profileBuffer,
  replayBuffer,
  sessionBuffer,
} from '@openpanel/db';
import { cronQueue, sessionsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import client from 'prom-client';

const Registry = client.Registry;

export const register = new Registry();

const queues = [sessionsQueue, cronQueue];

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

// Handler exceptions on the Kafka ingest path, counted per attempt — retries
// included, so the series shows real failure pressure and not just the
// messages that ran out of attempts.
export const kafkaHandlerFailuresTotal = new client.Counter({
  name: 'kafka_events_handler_failures_total',
  help: 'Kafka event handler exceptions (each attempt, retries included)',
  labelNames: ['partition'],
});

register.registerMetric(kafkaHandlerFailuresTotal);

// Messages written to the dead-letter topic after their attempts were
// exhausted (or after they failed to parse). One increment per message.
export const kafkaDeadLetteredTotal = new client.Counter({
  name: 'kafka_events_dead_lettered_total',
  help: 'Kafka event messages produced to the dead-letter topic',
  labelNames: ['partition', 'reason'],
});

register.registerMetric(kafkaDeadLetteredTotal);

// The dead-letter produce itself failed. The offset is then left unresolved
// and the message is redelivered, so this is a stuck partition, not a loss.
export const kafkaDeadLetterFailedTotal = new client.Counter({
  name: 'kafka_events_dead_letter_failed_total',
  help: 'Failed attempts to produce a Kafka event message to the dead-letter topic',
  labelNames: ['partition'],
});

register.registerMetric(kafkaDeadLetterFailedTotal);

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
        const metric = await queue.getDelayedCount();
        this.set(metric);
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

// The twelve `buffer_*` series moved to @openpanel/core with the buffers
// themselves (M8-001). V1 keeps its own registry, so it hands one in: the
// names, labels, buckets and registration order are core's, and this body is
// byte-identical to what this file registered before the move.
registerBufferMetrics(
  {
    event: eventBuffer,
    profile: profileBuffer,
    bot: botBuffer,
    session: sessionBuffer,
    replay: replayBuffer,
    group: groupBuffer,
    profileBackfill: profileBackfillBuffer,
  },
  register
);

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
