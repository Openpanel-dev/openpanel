import {
  createRedpandaEventsConsumer,
  type EventsQueuePayloadIncomingEvent,
  REDPANDA_EVENTS_TOPIC,
  REDPANDA_PARTITIONS_CONCURRENT,
  redpandaLogger,
} from '@openpanel/queue';
import { logger } from '../utils/logger';
import { markEventsActivity } from '../utils/worker-heartbeat';
import { incomingEvent } from './events.incoming-event';

export interface RedpandaConsumerHandle {
  stop: () => Promise<void>;
}

export async function startRedpandaEventsConsumer(): Promise<RedpandaConsumerHandle> {
  const consumer = createRedpandaEventsConsumer();
  await consumer.connect();
  await consumer.subscribe({
    topic: REDPANDA_EVENTS_TOPIC,
    fromBeginning: false,
  });

  consumer.on(consumer.events.HEARTBEAT, markEventsActivity);

  await consumer.run({
    partitionsConsumedConcurrently: REDPANDA_PARTITIONS_CONCURRENT,
    eachMessage: async ({ message, partition }) => {
      if (!message.value) {
        return;
      }
      let payload: EventsQueuePayloadIncomingEvent['payload'];
      try {
        payload = JSON.parse(
          message.value.toString()
        ) as EventsQueuePayloadIncomingEvent['payload'];
      } catch (err) {
        logger.error(
          { err, partition, offset: message.offset },
          'redpanda message parse failed'
        );
        return;
      }
      try {
        await incomingEvent(payload);
      } catch (err) {
        // Match the GroupWorker behaviour: log and ack. At-most-once on
        // handler exceptions; failures here would otherwise block the
        // partition. Future hardening can switch to retry/DLQ.
        logger.error(
          {
            err,
            partition,
            offset: message.offset,
            projectId: payload.projectId,
          },
          'redpanda incomingEvent handler failed'
        );
      } finally {
        markEventsActivity();
      }
    },
  });

  redpandaLogger.info(
    {
      topic: REDPANDA_EVENTS_TOPIC,
      partitionsConsumedConcurrently: REDPANDA_PARTITIONS_CONCURRENT,
    },
    'redpanda events consumer running'
  );

  return {
    stop: async () => {
      await consumer.disconnect();
    },
  };
}
