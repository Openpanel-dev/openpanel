// The Kafka producer's throughput knobs (M16-002), resolved in one place.
//
// WHERE THESE FIELDS ARE DECLARED, AND WHY IT IS NOT `KafkaConfig`:
// the config loader (`apps/api/src/config/env.ts`) sets them and they ride on
// `config.kafka`, but they are declared as the optional members of
// `KafkaProducerTuning` in this module's `ingest.constants.ts` — the one file
// of this module an app may import (ADR-022 R8) — rather than on `KafkaConfig`
// in `packages/core/src/config.ts`, which is outside M16-002's declared scope.
// Follow-up, one edit: move the three fields onto `KafkaConfig` as required
// numbers, drop `KafkaProducerTuning`, and delete the fallbacks below.
//
// The fallbacks are NOT a second production default: the loader always sets
// all three, so they only apply to a `CoreConfig` built by a test fixture.
// They reproduce today's behaviour exactly — one produce round-trip at a
// time, batching off.

import type { KafkaConfig } from '../../../config';
import type { KafkaProducerTuning } from '../ingest.constants';

/** kafkajs `maxInFlightRequests`: one produce round-trip at a time. */
const FALLBACK_MAX_IN_FLIGHT = 1;
/** Messages per `send()`. 1 = batching off — one message per send, as today. */
const FALLBACK_BATCH_SIZE = 1;
/** A partial batch's maximum wait. Inert while batching is off. */
const FALLBACK_BATCH_LINGER_MS = 5;

/** The smallest batch size that batches anything. */
const BATCHING_MIN_SIZE = 2;

export type TunedKafkaConfig = KafkaConfig & KafkaProducerTuning;

export interface ResolvedProducerTuning {
  maxInFlight: number;
  batchSize: number;
  lingerMs: number;
  /** False keeps the pre-M16-002 path: one message per awaited `send()`. */
  batchingEnabled: boolean;
}

export const resolveProducerTuning = (
  kafka: TunedKafkaConfig
): ResolvedProducerTuning => {
  const batchSize = kafka.producerBatchSize ?? FALLBACK_BATCH_SIZE;
  return {
    maxInFlight: kafka.producerMaxInFlight ?? FALLBACK_MAX_IN_FLIGHT,
    batchSize,
    lingerMs: kafka.producerBatchLingerMs ?? FALLBACK_BATCH_LINGER_MS,
    batchingEnabled: batchSize >= BATCHING_MIN_SIZE,
  };
};
