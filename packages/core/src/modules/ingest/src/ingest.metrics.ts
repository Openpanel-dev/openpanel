// The ingest-path collectors, moved from apps/worker/src/metrics.ts (M8-003)
// onto core's one registry. Names, labels and help strings are V1's; the
// worker-side copies die with apps/worker (P9). Until then V1's consumer and
// incoming-event delegate inject their own counters (both take `metrics` as a
// dependency), so V1's `/metrics` body is unchanged and these are the V2
// bindings.

import client from 'prom-client';
import { registry } from '../../../metrics';
import type { ConsumerMetrics, DeadLetterReason } from './consumer';

// Kafka event messages reprocessed (same offset redelivered outside a
// rebalance). Should stay ~0. A sustained non-zero rate means the consumer is
// re-delivering messages it already handled — an offset-handling/duplicate bug.
export const kafkaReprocessedTotal = new client.Counter({
  name: 'kafka_events_reprocessed_total',
  help: 'Kafka event messages reprocessed (offset redelivered outside a rebalance)',
  labelNames: ['partition'],
  registers: [registry],
});

// Handler exceptions on the Kafka ingest path, counted per attempt — retries
// included, so the series shows real failure pressure and not just the
// messages that ran out of attempts.
export const kafkaHandlerFailuresTotal = new client.Counter({
  name: 'kafka_events_handler_failures_total',
  help: 'Kafka event handler exceptions (each attempt, retries included)',
  labelNames: ['partition'],
  registers: [registry],
});

// Messages written to the dead-letter topic after their attempts were
// exhausted (or after they failed to parse). One increment per message.
export const kafkaDeadLetteredTotal = new client.Counter({
  name: 'kafka_events_dead_lettered_total',
  help: 'Kafka event messages produced to the dead-letter topic',
  labelNames: ['partition', 'reason'],
  registers: [registry],
});

// The dead-letter produce itself failed. The offset is then left unresolved
// and the message is redelivered, so this is a stuck partition, not a loss.
export const kafkaDeadLetterFailedTotal = new client.Counter({
  name: 'kafka_events_dead_letter_failed_total',
  help: 'Failed attempts to produce a Kafka event message to the dead-letter topic',
  labelNames: ['partition'],
  registers: [registry],
});

export const sessionsStarted = new client.Counter({
  name: 'sessions_started_total',
  help: 'session_start events emitted, by lifecycle kind',
  labelNames: ['kind'], // 'new' | 'boundary'
  registers: [registry],
});

/**
 * The consumer's `ConsumerMetrics`, bound to the counters above. Exists so
 * `main.ts` wires the consumer without reaching for four individual counters
 * — a metric is a module's business, not the entrypoint's.
 */
export const ingestConsumerMetrics = {
  reprocessed: (partition: string) => kafkaReprocessedTotal.inc({ partition }),
  handlerFailed: (partition: string) =>
    kafkaHandlerFailuresTotal.inc({ partition }),
  deadLettered: (partition: string, reason: DeadLetterReason) =>
    kafkaDeadLetteredTotal.inc({ partition, reason }),
  deadLetterFailed: (partition: string) =>
    kafkaDeadLetterFailedTotal.inc({ partition }),
} satisfies ConsumerMetrics;
