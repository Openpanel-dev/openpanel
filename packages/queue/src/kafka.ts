import { createLogger } from '@openpanel/logger';
import {
  Consumer,
  type ConsumerOptions,
  type Message,
  type MessagesStream,
  Producer,
} from '@platformatic/kafka';
import type { EventsQueuePayloadIncomingEvent } from './queues';

export const kafkaLogger = createLogger({ name: 'kafka' });

const parseBrokers = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
};

export const KAFKA_BROKERS = parseBrokers(process.env.KAFKA_BROKERS);
export const KAFKA_EVENTS_TOPIC = process.env.KAFKA_EVENTS_TOPIC || 'events';
export const KAFKA_CONSUMER_GROUP =
  process.env.KAFKA_CONSUMER_GROUP || 'openpanel-events';
export const KAFKA_PARTITIONS_CONCURRENT = Number.parseInt(
  process.env.KAFKA_PARTITIONS_CONCURRENT || '8',
  10
);

const KAFKA_BYTES_PER_MESSAGE = 1024;

export const KAFKA_MIN_MESSAGES = Number.parseInt(
  process.env.KAFKA_MIN_MESSAGES || '1',
  10
);
export const KAFKA_MAX_WAIT_MS = Number.parseInt(
  process.env.KAFKA_MAX_WAIT_MS || '500',
  10
);
export const KAFKA_MAX_MESSAGES_PER_PARTITION = Number.parseInt(
  process.env.KAFKA_MAX_MESSAGES_PER_PARTITION || '256',
  10
);
export const KAFKA_SESSION_TIMEOUT_MS = Number.parseInt(
  process.env.KAFKA_SESSION_TIMEOUT_MS || '30000',
  10
);
export const KAFKA_HEARTBEAT_INTERVAL_MS = Number.parseInt(
  process.env.KAFKA_HEARTBEAT_INTERVAL_MS || '3000',
  10
);
export const KAFKA_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.KAFKA_REQUEST_TIMEOUT_MS || '5000',
  10
);
export const KAFKA_CONNECTION_TIMEOUT_MS = Number.parseInt(
  process.env.KAFKA_CONNECTION_TIMEOUT_MS || '2000',
  10
);
// Commit offsets every N processed messages. Higher = fewer commits and
// more potential redelivery on crash; the downstream handler dedupes on
// event id so at-least-once is safe.
export const KAFKA_AUTOCOMMIT_EVERY = Number.parseInt(
  process.env.KAFKA_AUTOCOMMIT_EVERY || '100',
  10
);

const KAFKA_MIN_BYTES = KAFKA_MIN_MESSAGES * KAFKA_BYTES_PER_MESSAGE;
const KAFKA_MAX_BYTES_PER_PARTITION =
  KAFKA_MAX_MESSAGES_PER_PARTITION * KAFKA_BYTES_PER_MESSAGE;

const projectIdsEnv = (process.env.KAFKA_PROJECT_IDS || '').trim();
const allowAllProjects = projectIdsEnv === '*';
const projectIdAllowList = new Set<string>(
  projectIdsEnv && !allowAllProjects
    ? projectIdsEnv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : []
);

export const isKafkaConfigured = (): boolean => KAFKA_BROKERS.length > 0;

export const shouldUseKafka = (projectId: string): boolean => {
  if (!isKafkaConfigured()) {
    return false;
  }
  if (allowAllProjects) {
    return true;
  }
  return projectIdAllowList.has(projectId);
};

const clientId = process.env.KAFKA_CLIENT_ID || 'openpanel';

export type KafkaEventsMessage = Message<Buffer, Buffer, Buffer, Buffer>;
export type KafkaEventsConsumer = Consumer<Buffer, Buffer, Buffer, Buffer>;
export type KafkaEventsStream = MessagesStream<Buffer, Buffer, Buffer, Buffer>;

let producer: Producer<Buffer, Buffer, Buffer, Buffer> | null = null;

const getProducer = (): Producer<Buffer, Buffer, Buffer, Buffer> => {
  if (producer) {
    return producer;
  }
  if (!isKafkaConfigured()) {
    throw new Error('KAFKA_BROKERS is not set');
  }
  const p = new Producer<Buffer, Buffer, Buffer, Buffer>({
    clientId,
    bootstrapBrokers: KAFKA_BROKERS,
    idempotent: true,
    autocreateTopics: true,
    connectTimeout: KAFKA_CONNECTION_TIMEOUT_MS,
    requestTimeout: KAFKA_REQUEST_TIMEOUT_MS,
  });
  p.on('client:broker:connect', ({ broker }) => {
    kafkaLogger.info(
      { broker, topic: KAFKA_EVENTS_TOPIC },
      'kafka producer connected'
    );
  });
  producer = p;
  return p;
};

export const produceIncomingEvent = async (
  payload: EventsQueuePayloadIncomingEvent['payload'],
  partitionKey: string
): Promise<void> => {
  const p = getProducer();
  await p.send({
    messages: [
      {
        topic: KAFKA_EVENTS_TOPIC,
        key: Buffer.from(partitionKey),
        value: Buffer.from(JSON.stringify(payload)),
      },
    ],
  });
};

const consumers = new Set<KafkaEventsConsumer>();

export const createKafkaEventsConsumer = (options?: {
  groupId?: string;
}): KafkaEventsConsumer => {
  if (!isKafkaConfigured()) {
    throw new Error('KAFKA_BROKERS is not set');
  }
  const consumerOptions: ConsumerOptions<Buffer, Buffer, Buffer, Buffer> = {
    clientId,
    bootstrapBrokers: KAFKA_BROKERS,
    groupId: options?.groupId || KAFKA_CONSUMER_GROUP,
    sessionTimeout: KAFKA_SESSION_TIMEOUT_MS,
    heartbeatInterval: KAFKA_HEARTBEAT_INTERVAL_MS,
    minBytes: KAFKA_MIN_BYTES,
    maxWaitTime: KAFKA_MAX_WAIT_MS,
    maxBytesPerPartition: KAFKA_MAX_BYTES_PER_PARTITION,
    autocommit: KAFKA_AUTOCOMMIT_EVERY,
  };
  const consumer = new Consumer<Buffer, Buffer, Buffer, Buffer>(
    consumerOptions
  );
  consumers.add(consumer);
  return consumer;
};

// Force-close in callback form, wrapped as a promise. The promise overload
// on close() doesn't accept `force`, and we want to force-close defensively
// in case a stream was left active (the worker normally closes its stream
// first via handle.stop(), but disconnectKafka is the catch-all).
const closeConsumerForced = (c: KafkaEventsConsumer): Promise<void> =>
  new Promise<void>((resolve) => {
    c.close(true, (err) => {
      if (err) {
        kafkaLogger.error({ err }, 'kafka consumer close error');
      }
      resolve();
    });
  });

export const disconnectKafka = async (): Promise<void> => {
  const tasks: Promise<unknown>[] = [];
  for (const c of consumers) {
    tasks.push(closeConsumerForced(c));
  }
  consumers.clear();
  if (producer) {
    const p = producer;
    producer = null;
    tasks.push(
      p.close().catch((err) => {
        kafkaLogger.error({ err }, 'kafka producer close error');
      })
    );
  }
  await Promise.all(tasks);
};
