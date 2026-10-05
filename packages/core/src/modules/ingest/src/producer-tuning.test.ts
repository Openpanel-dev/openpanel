/**
 * Batching is ON at the shipped defaults (size 25, linger 5 ms) and
 * `maxInFlightRequests` stays 1. The three knobs are required `KafkaConfig`
 * fields, so there are no fallbacks to test.
 */

import { describe, expect, test } from 'bun:test';
import type { KafkaConfig } from '../../../config';
import { resolveProducerTuning } from './producer-tuning';

/** The values `apps/api/src/config/env.ts` resolves for an empty environment. */
const SHIPPED_DEFAULTS = {
  producerMaxInFlight: 1,
  producerBatchSize: 25,
  producerBatchLingerMs: 5,
} as const;

const kafkaConfig = (tuning: Partial<KafkaConfig> = {}): KafkaConfig =>
  ({
    clientId: 'openpanel',
    brokers: [],
    eventsTopic: 'events',
    eventsDlqTopic: 'events-dlq',
    consumerGroup: 'openpanel-events',
    maxMessageBytes: 1_048_576,
    partitionsConcurrent: 8,
    minMessages: 1,
    maxWaitMs: 500,
    maxMessagesPerPartition: 256,
    sessionTimeoutMs: 30_000,
    heartbeatIntervalMs: 3000,
    requestTimeoutMs: 5000,
    connectionTimeoutMs: 2000,
    producerRetries: 2,
    producerInitialRetryMs: 100,
    producerMaxRetryMs: 1000,
    ...SHIPPED_DEFAULTS,
    handlerMaxAttempts: 3,
    handlerRetryInitialMs: 100,
    handlerRetryMaxMs: 1000,
    security: {
      ssl: { enabled: false, caPath: undefined, rejectUnauthorized: undefined },
      sasl: undefined,
    },
    ...tuning,
  }) satisfies KafkaConfig;

describe('resolveProducerTuning', () => {
  test('the shipped defaults batch at 25 with a 5 ms linger', () => {
    const tuning = resolveProducerTuning(kafkaConfig());
    expect(tuning.batchSize).toBe(25);
    expect(tuning.lingerMs).toBe(5);
    expect(tuning.batchingEnabled).toBe(true);
  });

  test('ADR-023 leaves maxInFlightRequests at one', () => {
    expect(resolveProducerTuning(kafkaConfig()).maxInFlight).toBe(1);
  });

  test('a batch size of one turns batching off again', () => {
    const tuning = resolveProducerTuning(kafkaConfig({ producerBatchSize: 1 }));
    expect(tuning.batchSize).toBe(1);
    expect(tuning.batchingEnabled).toBe(false);
  });

  test('the knobs pass through to kafkajs untouched', () => {
    const tuning = resolveProducerTuning(
      kafkaConfig({
        producerMaxInFlight: 5,
        producerBatchSize: 50,
        producerBatchLingerMs: 10,
      })
    );
    expect(tuning.maxInFlight).toBe(5);
    expect(tuning.batchSize).toBe(50);
    expect(tuning.lingerMs).toBe(10);
  });
});
