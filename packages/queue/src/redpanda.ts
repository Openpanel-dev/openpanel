import { createLogger } from '@openpanel/logger';
import { type Consumer, Kafka, logLevel, type Producer } from 'kafkajs';
import type { EventsQueuePayloadIncomingEvent } from './queues';

export const redpandaLogger = createLogger({ name: 'redpanda' });

const parseBrokers = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
};

export const REDPANDA_BROKERS = parseBrokers(process.env.REDPANDA_BROKERS);
export const REDPANDA_EVENTS_TOPIC =
  process.env.REDPANDA_EVENTS_TOPIC || 'events';
export const REDPANDA_CONSUMER_GROUP =
  process.env.REDPANDA_CONSUMER_GROUP || 'openpanel-events';
export const REDPANDA_PARTITIONS_CONCURRENT = Number.parseInt(
  process.env.REDPANDA_PARTITIONS_CONCURRENT || '8',
  10
);

const projectIdsEnv = (process.env.REDPANDA_PROJECT_IDS || '').trim();
const allowAllProjects = projectIdsEnv === '*';
const projectIdAllowList = new Set<string>(
  projectIdsEnv && !allowAllProjects
    ? projectIdsEnv
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : []
);

export const isRedpandaConfigured = (): boolean => REDPANDA_BROKERS.length > 0;

export const shouldUseRedpanda = (projectId: string): boolean => {
  if (!isRedpandaConfigured()) {
    return false;
  }
  if (allowAllProjects) {
    return true;
  }
  return projectIdAllowList.has(projectId);
};

let kafka: Kafka | null = null;
const getKafka = (): Kafka => {
  if (!isRedpandaConfigured()) {
    throw new Error(
      'REDPANDA_BROKERS env var is not set; cannot create Kafka client'
    );
  }
  if (!kafka) {
    kafka = new Kafka({
      clientId: process.env.REDPANDA_CLIENT_ID || 'openpanel',
      brokers: REDPANDA_BROKERS,
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
        redpandaLogger.info(
          { brokers: REDPANDA_BROKERS, topic: REDPANDA_EVENTS_TOPIC },
          'redpanda producer connected'
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
    topic: REDPANDA_EVENTS_TOPIC,
    messages: [
      {
        key: Buffer.from(partitionKey),
        value: Buffer.from(JSON.stringify(payload)),
      },
    ],
  });
};

const consumers = new Set<Consumer>();

export const createRedpandaEventsConsumer = (options?: {
  groupId?: string;
}): Consumer => {
  const client = getKafka();
  const consumer = client.consumer({
    groupId: options?.groupId || REDPANDA_CONSUMER_GROUP,
  });
  consumers.add(consumer);
  return consumer;
};

export const disconnectRedpanda = async (): Promise<void> => {
  const tasks: Promise<unknown>[] = [];
  for (const c of consumers) {
    tasks.push(
      c.disconnect().catch((err) => {
        redpandaLogger.error({ err }, 'redpanda consumer disconnect error');
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
        redpandaLogger.error({ err }, 'redpanda producer disconnect error');
      })
    );
  }
  await Promise.all(tasks);
};
