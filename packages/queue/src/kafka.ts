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

// Producer fail-fast knobs. Defaults give a worst-case total of a few seconds
// instead of kafkajs's stock ~150s, so a broker outage doesn't park HTTP
// requests on the track path long enough to saturate the LB.
export const KAFKA_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.KAFKA_REQUEST_TIMEOUT_MS || '5000',
  10
);
export const KAFKA_CONNECTION_TIMEOUT_MS = Number.parseInt(
  process.env.KAFKA_CONNECTION_TIMEOUT_MS || '2000',
  10
);
export const KAFKA_PRODUCER_RETRIES = Number.parseInt(
  process.env.KAFKA_PRODUCER_RETRIES || '2',
  10
);
export const KAFKA_PRODUCER_INITIAL_RETRY_MS = Number.parseInt(
  process.env.KAFKA_PRODUCER_INITIAL_RETRY_MS || '100',
  10
);
export const KAFKA_PRODUCER_MAX_RETRY_MS = Number.parseInt(
  process.env.KAFKA_PRODUCER_MAX_RETRY_MS || '1000',
  10
);

const KAFKA_MIN_BYTES = KAFKA_MIN_MESSAGES * KAFKA_BYTES_PER_MESSAGE;
const KAFKA_MAX_BYTES_PER_PARTITION =
  KAFKA_MAX_MESSAGES_PER_PARTITION * KAFKA_BYTES_PER_MESSAGE;

export const isKafkaConfigured = (): boolean => KAFKA_BROKERS.length > 0;

export const shouldUseKafka = (): boolean => isKafkaConfigured();

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
      requestTimeout: KAFKA_REQUEST_TIMEOUT_MS,
      connectionTimeout: KAFKA_CONNECTION_TIMEOUT_MS,
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
      // 1 (not 5) to avoid in-flight reordering after a transient broker hiccup:
      // with idempotency on and low retries, reordered batches trip
      // OUT_OF_ORDER_SEQUENCE_NUMBER and stick the producer per-partition.
      maxInFlightRequests: 1,
      allowAutoTopicCreation: true,
      retry: {
        retries: KAFKA_PRODUCER_RETRIES,
        initialRetryTime: KAFKA_PRODUCER_INITIAL_RETRY_MS,
        maxRetryTime: KAFKA_PRODUCER_MAX_RETRY_MS,
        factor: 2,
      },
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

// Kafka error codes that mean the producer's PID/sequence state is
// permanently out of sync with the broker for some partition — only a
// fresh PID (new producer instance) can recover.
//   45 OUT_OF_ORDER_SEQUENCE_NUMBER
//   46 DUPLICATE_SEQUENCE_NUMBER
//   47 INVALID_PRODUCER_EPOCH
//   65 UNKNOWN_PRODUCER_ID
const FATAL_PRODUCER_ERROR_CODES = new Set<number>([45, 46, 47, 65]);

const isFatalProducerError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = (err as { name?: string }).name;
  // Retries-exceeded leaves the idempotent producer's sequence state
  // suspect (broker may have persisted a batch we gave up on), so treat
  // it as fatal-for-this-producer too.
  if (name === 'KafkaJSNumberOfRetriesExceeded') {
    return true;
  }
  if (name === 'KafkaJSProtocolError') {
    const code = (err as { code?: number }).code;
    return typeof code === 'number' && FATAL_PRODUCER_ERROR_CODES.has(code);
  }
  return false;
};

const resetProducer = (broken: Producer): void => {
  if (producer !== broken) {
    return;
  }
  producer = null;
  producerConnectPromise = null;
  broken.disconnect().catch((err) => {
    kafkaLogger.warn(
      { err },
      'kafka producer disconnect after fatal error failed'
    );
  });
};

export const produceIncomingEvent = async (
  payload: EventsQueuePayloadIncomingEvent['payload'],
  partitionKey: string
): Promise<void> => {
  const p = await getProducer();
  try {
    await p.send({
      topic: KAFKA_EVENTS_TOPIC,
      timeout: KAFKA_REQUEST_TIMEOUT_MS,
      messages: [
        {
          key: Buffer.from(partitionKey),
          value: Buffer.from(JSON.stringify(payload)),
        },
      ],
    });
  } catch (err) {
    if (isFatalProducerError(err)) {
      kafkaLogger.warn(
        { err },
        'kafka producer in fatal state; resetting for next call'
      );
      resetProducer(p);
    }
    throw err;
  }
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
