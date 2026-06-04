import {
  createKafkaEventsConsumer,
  type EventsQueuePayloadIncomingEvent,
  KAFKA_EVENTS_TOPIC,
  KAFKA_PARTITIONS_CONCURRENT,
  kafkaLogger,
  type KafkaMessage,
} from '@openpanel/queue';
import { logger } from '../utils/logger';
import { markEventsActivity } from '../utils/worker-heartbeat';
import { incomingEvent } from './events.incoming-event';

export interface KafkaConsumerHandle {
  stop: () => Promise<void>;
}

// Heartbeat every N messages within a per-key group. The default kafkajs
// sessionTimeout is 30s — calling heartbeat every 16 messages keeps us
// comfortably under that even for slow handlers.
const HEARTBEAT_EVERY = 16;

export async function startKafkaEventsConsumer(): Promise<KafkaConsumerHandle> {
  const consumer = createKafkaEventsConsumer();
  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_EVENTS_TOPIC,
    fromBeginning: false,
  });

  consumer.on(consumer.events.HEARTBEAT, markEventsActivity);

  await consumer.run({
    partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    eachBatchAutoResolve: false,
    eachBatch: async ({
      batch,
      resolveOffset,
      heartbeat,
      isRunning,
      isStale,
    }) => {
      if (batch.messages.length === 0) {
        return;
      }

      // Group by partition key (= deviceId or `${projectId}:${profileId}`).
      // Same-key messages stay serial so sessionBuffer/session-end-job state
      // can't race; different keys run in parallel via Promise.all.
      // Keyless messages get their own singleton group.
      const groups = new Map<string, KafkaMessage[]>();
      for (const m of batch.messages) {
        const key = m.key ? m.key.toString() : `__no_key__:${m.offset}`;
        const arr = groups.get(key);
        if (arr) {
          arr.push(m);
        } else {
          groups.set(key, [m]);
        }
      }

      await Promise.all(
        [...groups.values()].map(async (msgs) => {
          let processed = 0;
          for (const m of msgs) {
            if (!isRunning() || isStale()) {
              return;
            }

            if (m.value) {
              let payload: EventsQueuePayloadIncomingEvent['payload'] | null =
                null;
              try {
                payload = JSON.parse(
                  m.value.toString()
                ) as EventsQueuePayloadIncomingEvent['payload'];
              } catch (err) {
                logger.error(
                  { err, partition: batch.partition, offset: m.offset },
                  'kafka message parse failed'
                );
              }
              if (payload) {
                try {
                  await incomingEvent(payload);
                } catch (err) {
                  // Match the previous eachMessage behaviour: log and ack.
                  // At-most-once on handler exceptions; failures here would
                  // otherwise block the partition.
                  logger.error(
                    {
                      err,
                      partition: batch.partition,
                      offset: m.offset,
                      projectId: payload.projectId,
                    },
                    'kafka incomingEvent handler failed'
                  );
                }
              }
            }

            resolveOffset(m.offset);
            processed += 1;
            if (processed % HEARTBEAT_EVERY === 0) {
              await heartbeat();
            }
          }
        })
      );

      await heartbeat();
      markEventsActivity();
    },
  });

  kafkaLogger.info(
    {
      topic: KAFKA_EVENTS_TOPIC,
      partitionsConsumedConcurrently: KAFKA_PARTITIONS_CONCURRENT,
    },
    'kafka events consumer running'
  );

  return {
    stop: async () => {
      await consumer.disconnect();
    },
  };
}
