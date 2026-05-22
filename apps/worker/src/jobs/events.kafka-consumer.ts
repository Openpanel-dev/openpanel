import {
  createKafkaEventsConsumer,
  type EventsQueuePayloadIncomingEvent,
  KAFKA_EVENTS_TOPIC,
  KAFKA_PARTITIONS_CONCURRENT,
  type KafkaEventsMessage,
  kafkaLogger,
} from '@openpanel/queue';
import { forEach } from 'hwp';
import { logger } from '../utils/logger';
import { markEventsActivity } from '../utils/worker-heartbeat';
import { incomingEvent } from './events.incoming-event';

export interface KafkaConsumerHandle {
  stop: () => Promise<void>;
}

export async function startKafkaEventsConsumer(): Promise<KafkaConsumerHandle> {
  const consumer = createKafkaEventsConsumer();

  consumer.on('consumer:heartbeat:end', markEventsActivity);

  const stream = await consumer.consume({ topics: [KAFKA_EVENTS_TOPIC] });

  // Same-key messages stay serial; different keys parallelize up to
  // KAFKA_PARTITIONS_CONCURRENT. The key is deviceId or projectId:profileId
  // (set in track.controller.ts), so this preserves per-session ordering
  // for the sessionBuffer / session-end pipeline.
  const tails = new Map<string, Promise<void>>();

  const consumeLoop = forEach(
    stream,
    async (message: KafkaEventsMessage) => {
      const key =
        message.key && message.key.length > 0
          ? message.key.toString()
          : `__no_key__:${message.offset.toString()}`;
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(() => processMessage(message));
      tails.set(key, next);
      try {
        await next;
      } finally {
        if (tails.get(key) === next) {
          tails.delete(key);
        }
      }
    },
    KAFKA_PARTITIONS_CONCURRENT
  ).catch((err: unknown) => {
    logger.error({ err }, 'kafka consumer stream errored');
  });

  kafkaLogger.info(
    {
      topic: KAFKA_EVENTS_TOPIC,
      partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    },
    'kafka events consumer running'
  );
  markEventsActivity();

  return {
    stop: async () => {
      await stream.close();
      await consumeLoop;
      await consumer.close();
    },
  };
}

async function processMessage(message: KafkaEventsMessage): Promise<void> {
  if (!message.value || message.value.length === 0) {
    return;
  }
  let payload: EventsQueuePayloadIncomingEvent['payload'] | null = null;
  try {
    payload = JSON.parse(
      message.value.toString()
    ) as EventsQueuePayloadIncomingEvent['payload'];
  } catch (err) {
    logger.error(
      {
        err,
        partition: message.partition,
        offset: message.offset.toString(),
      },
      'kafka message parse failed'
    );
    return;
  }
  try {
    await incomingEvent(payload);
  } catch (err) {
    // At-most-once on handler exceptions: log and let autocommit advance.
    // Throwing here would block the partition until human intervention.
    logger.error(
      {
        err,
        partition: message.partition,
        offset: message.offset.toString(),
        projectId: payload.projectId,
      },
      'kafka incomingEvent handler failed'
    );
  }
}
