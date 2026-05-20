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
    }),
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
  }),
);

// ---- Flush metrics (populated via flushObserver hooks) ----

const flushDuration = new client.Histogram({
  name: 'buffer_flush_duration_ms',
  help: 'Wall time of a tryFlush call, including lock acquisition',
  labelNames: ['buffer', 'result', 'trigger'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000],
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
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000],
});
register.registerMetric(chInsertDurationMs);

const flushLlenAtStart = new client.Histogram({
  name: 'buffer_flush_llen_at_start',
  help: 'LLEN observed at the start of a flush attempt',
  labelNames: ['buffer'],
  buckets: [0, 10, 100, 500, 1000, 5000, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000],
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
  help: 'Total add() calls per buffer (ingest rate). Pair with buffer_flush_rows_total for fill-vs-drain.',
  labelNames: ['buffer'],
});
register.registerMetric(addTotal);

for (const buf of allBuffers) {
  buf.flushObserver = (obs) => {
    flushTotal.inc({
      buffer: obs.buffer,
      result: obs.result,
      trigger: obs.trigger,
    });
    flushDuration.observe(
      { buffer: obs.buffer, result: obs.result, trigger: obs.trigger },
      obs.totalMs,
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
        obs.phases.lrangeMs,
      );
    }
    if (obs.phases?.trimMs != null) {
      redisOpDurationMs.observe(
        { buffer: obs.buffer, op: 'trim' },
        obs.phases.trimMs,
      );
    }
    if (obs.phases?.chInsertMs != null) {
      chInsertDurationMs.observe(
        { buffer: obs.buffer },
        obs.phases.chInsertMs,
      );
    }
  };

  buf.addObserver = (obs) => {
    addTotal.inc({ buffer: obs.buffer });
    addDurationMs.observe({ buffer: obs.buffer }, obs.durationMs);
  };
}
