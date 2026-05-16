import { createLogger } from '@openpanel/logger';
import { type Consumer, Kafka, logLevel, type Producer } from 'kafkajs';
import type { EventsQueuePayloadIncomingEvent } from './queues';

export type { KafkaMessage } from 'kafkajs';

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

// Approx size of one event payload (observed range ~0.9–1.3 KiB).
// We size fetch knobs in messages and convert to bytes via this constant.
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

let kafka: Kafka | null = null;
const getKafka = (): Kafka => {
  if (!isKafkaConfigured()) {
    throw new Error(
      'KAFKA_BROKERS env var is not set; cannot create Kafka client'
    );
  }
  if (!kafka) {
    kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID || 'openpanel',
      brokers: KAFKA_BROKERS,
      logLevel: logLevel.WARN,
    });
  }
  return kafka;
};

let producer: Producer | null = null;
let producerConnectPromise: Promise<Producer> | null = null;

const getProducer = async (): Promise<Producer> => {
  if (producer) {
    return producer;
  }
  if (!producerConnectPromise) {
    const client = getKafka();
    const p = client.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      allowAutoTopicCreation: true,
    });
    producerConnectPromise = p
      .connect()
      .then(() => {
        producer = p;
        kafkaLogger.info(
          { brokers: KAFKA_BROKERS, topic: KAFKA_EVENTS_TOPIC },
          'kafka producer connected'
        );
        return p;
      })
      .catch((err) => {
        producerConnectPromise = null;
        throw err;
      });
  }
  return producerConnectPromise;
};

export const produceIncomingEvent = async (
  payload: EventsQueuePayloadIncomingEvent['payload'],
  partitionKey: string
): Promise<void> => {
  const p = await getProducer();
  await p.send({
    topic: KAFKA_EVENTS_TOPIC,
    messages: [
      {
        key: Buffer.from(partitionKey),
        value: Buffer.from(JSON.stringify(payload)),
      },
    ],
  });
};

const consumers = new Set<Consumer>();

export const createKafkaEventsConsumer = (options?: {
  groupId?: string;
}): Consumer => {
  const client = getKafka();
  const consumer = client.consumer({
    groupId: options?.groupId || KAFKA_CONSUMER_GROUP,
    sessionTimeout: KAFKA_SESSION_TIMEOUT_MS,
    heartbeatInterval: KAFKA_HEARTBEAT_INTERVAL_MS,
    minBytes: KAFKA_MIN_BYTES,
    maxWaitTimeInMs: KAFKA_MAX_WAIT_MS,
    maxBytesPerPartition: KAFKA_MAX_BYTES_PER_PARTITION,
  });
  consumers.add(consumer);
  return consumer;
};

export const disconnectKafka = async (): Promise<void> => {
  const tasks: Promise<unknown>[] = [];
  for (const c of consumers) {
    tasks.push(
      c.disconnect().catch((err) => {
        kafkaLogger.error({ err }, 'kafka consumer disconnect error');
      })
    );
  }
  consumers.clear();
  if (producer) {
    const p = producer;
    producer = null;
    producerConnectPromise = null;
    tasks.push(
      p.disconnect().catch((err) => {
        kafkaLogger.error({ err }, 'kafka producer disconnect error');
      })
    );
  }
  await Promise.all(tasks);
};
