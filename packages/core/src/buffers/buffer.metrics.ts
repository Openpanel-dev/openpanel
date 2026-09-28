// The twelve `buffer_*` series (names and labels reproduced exactly).
// Registered per boot rather than per import, because the buffers themselves
// are per boot — and only where a role consumes queues, since the LLEN
// gauges cost one Redis round trip per buffer per scrape.

import client from 'prom-client';
import { registry } from '../metrics';
import type { Buffers } from './create-buffers';

const FLUSH_DURATION_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
];
const REDIS_OP_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];
const CH_DURATION_BUCKETS_MS = [
  10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000,
];
const LLEN_BUCKETS = [
  0, 10, 100, 500, 1000, 5000, 10_000, 50_000, 100_000, 500_000, 1_000_000,
  5_000_000,
];
const ADD_DURATION_BUCKETS_MS = [
  0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 5000,
];

/**
 * Registration order matches the order the series appear in the `/metrics`
 * body.
 */
function allBuffers(buffers: Buffers) {
  return [
    buffers.event,
    buffers.profile,
    buffers.bot,
    buffers.session,
    buffers.replay,
    buffers.group,
    buffers.profileBackfill,
  ];
}

/**
 * Registers the buffer metrics and installs the flush/add observers on the
 * given buffers. Call once per process: prom-client throws on a duplicate
 * series name, and each buffer holds exactly one observer slot.
 */
export function registerBufferMetrics(
  buffers: Buffers,
  register: client.Registry = registry
): void {
  const bufferList = allBuffers(buffers);

  // Ground-truth LLEN of each buffer's main list. O(1) — no shadow counter.
  for (const buf of bufferList) {
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

  // Number of events sitting in event-buffer's in-process micro-batch
  // (pre-Redis). Other buffers don't have a local layer.
  register.registerMetric(
    new client.Gauge({
      name: 'buffer_event_pending_local_count',
      help: 'Events in event-buffer process-local micro-batch (not yet in Redis)',
      collect() {
        try {
          this.set(buffers.event.getPendingLocalCount());
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
    buckets: FLUSH_DURATION_BUCKETS_MS,
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
    buckets: REDIS_OP_BUCKETS_MS,
  });
  register.registerMetric(redisOpDurationMs);

  const chInsertDurationMs = new client.Histogram({
    name: 'buffer_ch_insert_duration_ms',
    help: 'Duration of the ClickHouse insert(s) inside a single flush',
    labelNames: ['buffer'],
    buckets: CH_DURATION_BUCKETS_MS,
  });
  register.registerMetric(chInsertDurationMs);

  // CH SELECT latency inside a flush (e.g. profile-buffer's fetch-existing
  // profiles for merge). Separated from ch_insert because for some buffers
  // the SELECT dominates total flush time.
  const chFetchDurationMs = new client.Histogram({
    name: 'buffer_ch_fetch_duration_ms',
    help: 'Duration of CH SELECT(s) inside a single flush (e.g. profile merge fetch)',
    labelNames: ['buffer'],
    buckets: CH_DURATION_BUCKETS_MS,
  });
  register.registerMetric(chFetchDurationMs);

  const flushLlenAtStart = new client.Histogram({
    name: 'buffer_flush_llen_at_start',
    help: 'LLEN observed at the start of a flush attempt',
    labelNames: ['buffer'],
    buckets: LLEN_BUCKETS,
  });
  register.registerMetric(flushLlenAtStart);

  // ---- Add-path metrics ----

  const addDurationMs = new client.Histogram({
    name: 'buffer_add_duration_ms',
    help: 'Duration of a single add() call (per-event ingest path)',
    labelNames: ['buffer'],
    buckets: ADD_DURATION_BUCKETS_MS,
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

  for (const buf of bufferList) {
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
        chInsertDurationMs.observe(
          { buffer: obs.buffer },
          obs.phases.chInsertMs
        );
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
}
