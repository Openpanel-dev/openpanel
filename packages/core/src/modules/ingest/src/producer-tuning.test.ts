/**
 * M16-002's non-negotiable: every default reproduces today's behaviour — one
 * produce round-trip at a time, one message per `send()`. A config that says
 * nothing about the knobs must therefore resolve to exactly that.
 */

import { describe, expect, test } from 'bun:test';
import {
  resolveProducerTuning,
  type TunedKafkaConfig,
} from './producer-tuning';

const kafkaConfig = (
  tuning: Partial<TunedKafkaConfig> = {}
): TunedKafkaConfig =>
  ({
    clientId: 'openpanel',
    brokers: [],
    eventsTopic: 'events',
    eventsDlqTopic: 'events-dlq',
    consumerGroup: 'openpanel-events',
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
    handlerMaxAttempts: 3,
    handlerRetryInitialMs: 100,
    handlerRetryMaxMs: 1000,
    ...tuning,
  }) satisfies TunedKafkaConfig;

describe('resolveProducerTuning', () => {
  test('an unconfigured config reproduces the pre-M16-002 behaviour', () => {
    const tuning = resolveProducerTuning(kafkaConfig());
    expect(tuning.maxInFlight).toBe(1);
    expect(tuning.batchSize).toBe(1);
    expect(tuning.batchingEnabled).toBe(false);
  });

  test('the loader-supplied defaults also leave batching off', () => {
    const tuning = resolveProducerTuning(
      kafkaConfig({
        producerMaxInFlight: 1,
        producerBatchSize: 1,
        producerBatchLingerMs: 5,
      })
    );
    expect(tuning.maxInFlight).toBe(1);
    expect(tuning.batchingEnabled).toBe(false);
  });

  test('a batch size of two or more turns batching on', () => {
    const tuning = resolveProducerTuning(
      kafkaConfig({ producerBatchSize: 50, producerBatchLingerMs: 10 })
    );
    expect(tuning.batchSize).toBe(50);
    expect(tuning.lingerMs).toBe(10);
    expect(tuning.batchingEnabled).toBe(true);
  });

  test('the in-flight knob passes through to kafkajs untouched', () => {
    expect(
      resolveProducerTuning(kafkaConfig({ producerMaxInFlight: 5 })).maxInFlight
    ).toBe(5);
  });
});
