// Dissolved into @openpanel/core's ingest module (M8-003): the batch handler
// (per-key serial groups, the ascending contiguous-prefix offset walk,
// at-least-once, bounded retry, DLQ) is
// packages/core/src/modules/ingest/src/consumer.ts. This file stays (DELEGATE
// PATTERN) and supplies the halves core cannot reach: @openpanel/queue's
// kafkajs client and its topic / consumer-group / retry constants, this
// worker's registry counters, and the events heartbeat.
import { startKafkaEventsConsumer as startKafkaEventsConsumerCore } from '@openpanel/core';
import {
  createKafkaEventsConsumer,
  KAFKA_EVENTS_TOPIC,
  KAFKA_HANDLER_MAX_ATTEMPTS,
  KAFKA_HANDLER_RETRY_INITIAL_MS,
  KAFKA_HANDLER_RETRY_MAX_MS,
  KAFKA_PARTITIONS_CONCURRENT,
  kafkaLogger,
  produceDeadLetterEvent,
} from '@openpanel/queue';
import {
  kafkaDeadLetteredTotal,
  kafkaDeadLetterFailedTotal,
  kafkaHandlerFailuresTotal,
  kafkaReprocessedTotal,
} from '../metrics';
import { logger } from '../utils/logger';
import { markEventsActivity } from '../utils/worker-heartbeat';
import { incomingEvent } from './events.incoming-event';

export type { KafkaConsumerHandle } from '@openpanel/core';

export function startKafkaEventsConsumer() {
  return startKafkaEventsConsumerCore({
    createConsumer: createKafkaEventsConsumer,
    logger,
    kafkaLogger,
    topic: KAFKA_EVENTS_TOPIC,
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    batch: {
      handleEvent: incomingEvent,
      sendToDeadLetter: produceDeadLetterEvent,
      logger,
      metrics: {
        reprocessed: (partition) => kafkaReprocessedTotal.inc({ partition }),
        handlerFailed: (partition) =>
          kafkaHandlerFailuresTotal.inc({ partition }),
        deadLettered: (partition, reason) =>
          kafkaDeadLetteredTotal.inc({ partition, reason }),
        deadLetterFailed: (partition) =>
          kafkaDeadLetterFailedTotal.inc({ partition }),
      },
      onActivity: markEventsActivity,
      maxAttempts: KAFKA_HANDLER_MAX_ATTEMPTS,
      initialRetryMs: KAFKA_HANDLER_RETRY_INITIAL_MS,
      maxRetryMs: KAFKA_HANDLER_RETRY_MAX_MS,
    },
  });
}
