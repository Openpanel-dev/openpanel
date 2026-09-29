// The Kafka producer's throughput knobs, resolved in one place.
//
// The three fields are required members of `KafkaConfig`
// (`packages/core/src/config.ts`): the config loader always sets them, so there
// is no fallback here and no second default anywhere. This file only decides
// whether the configured size batches at all.

import type { KafkaConfig } from '../../../config';

/** The smallest batch size that batches anything. */
const BATCHING_MIN_SIZE = 2;

export interface ResolvedProducerTuning {
  maxInFlight: number;
  batchSize: number;
  lingerMs: number;
  /** False keeps the unbatched path: one message per awaited `send()`. */
  batchingEnabled: boolean;
}

export const resolveProducerTuning = (
  kafka: KafkaConfig
): ResolvedProducerTuning => ({
  maxInFlight: kafka.producerMaxInFlight,
  batchSize: kafka.producerBatchSize,
  lingerMs: kafka.producerBatchLingerMs,
  batchingEnabled: kafka.producerBatchSize >= BATCHING_MIN_SIZE,
});
