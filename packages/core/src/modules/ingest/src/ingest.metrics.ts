// The ingest-path collectors, on core's one registry.

import client from 'prom-client';
import { registry } from '../../../metrics';
import type { ConsumerMetrics, DeadLetterReason } from './consumer';

// Events whose producer-minted id had already been seen. This is a MARKER, not
// a dedupe: the event is inserted either way and this counter is the whole
// point of the check. The older offset-keyed counter lived in one process's
// heap and was blind to every duplicate that mattered (161 real duplicates,
// 0 reprocessed increments).
//
// It UNDERCOUNTS by design: a duplicate whose marker could not be written
// (Redis away) is not counted, because the check fails open rather than
// delaying the event.
export const duplicateEventsMarkedTotal = new client.Counter({
  name: 'ingest_duplicate_events_marked_total',
  help: 'Events whose producer-minted id had already been seen (marked, still inserted)',
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

// Messages recorded in the dead-letter list after their attempts were exhausted
// (or after they failed to parse), then DROPPED. One increment per message. The
// list is capped at the last N, so this counter — not the list — is the only
// thing that tells 50,000 drops apart from 12.
export const kafkaDeadLetteredTotal = new client.Counter({
  name: 'kafka_events_dead_lettered_total',
  help: 'Kafka event messages recorded in the dead-letter list and dropped',
  labelNames: ['partition', 'reason'],
  registers: [registry],
});

// The dead-letter write itself failed, so the message was DROPPED WITHOUT being
// recorded — Redis unreachable, most likely, which is also when handlers fail.
// This is real loss, not a stuck partition: the offset is resolved anyway and
// nothing retries the message.
export const kafkaDeadLetterFailedTotal = new client.Counter({
  name: 'kafka_events_dead_letter_failed_total',
  help: 'Kafka event messages dropped without being recorded (dead-letter write failed)',
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
  handlerFailed: (partition: string) =>
    kafkaHandlerFailuresTotal.inc({ partition }),
  deadLettered: (partition: string, reason: DeadLetterReason) =>
    kafkaDeadLetteredTotal.inc({ partition, reason }),
  deadLetterFailed: (partition: string) =>
    kafkaDeadLetterFailedTotal.inc({ partition }),
} satisfies ConsumerMetrics;

const LEGACY_EVENT_CLIENT_ID_LABEL = 'client_id';

/**
 * `POST /event` is kept as a legacy compat route rather than deleted, because
 * production still has projects posting to it. This counter is the evidence
 * for removing it later — when it reads zero for every client, `/event` and
 * the `mixan-*` header fallback can both go.
 */
export const legacyEventRequestsTotal = new client.Counter({
  name: 'openpanel_legacy_event_requests_total',
  help: 'Requests to the legacy POST /event ingestion route, by client id',
  labelNames: [LEGACY_EVENT_CLIENT_ID_LABEL],
  registers: [registry],
});

export function recordLegacyEventRequest(clientId: string): void {
  legacyEventRequestsTotal.inc({ [LEGACY_EVENT_CLIENT_ID_LABEL]: clientId });
}
