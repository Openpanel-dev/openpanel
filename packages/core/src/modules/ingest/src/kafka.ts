// Moved from packages/queue/src/kafka.ts (M11-003), byte-for-byte apart from
// the three repointed imports and the de-duplicated `DeadLetterMessage` below.
// What kept it out of core was the import direction, not the code: it lived
// in @openpanel/queue, a package that imports @openpanel/core for its logger,
// so core could not import it back. Moving the file takes it out of that
// cycle — `createLogger` is a sibling now, and both the producer and the
// consumer sit in the module that owns the transport (ADR-004: Kafka is the
// sole events transport — no topic, group or envelope changes with the move).
//
// NOTHING here constructs a Kafka client at import time: `getKafka()` is lazy
// and only `assertKafkaConfigured` reads the broker list eagerly, so core
// stays importable with no broker and `bun test` still runs offline.

import {
  type Admin,
  type Consumer,
  type IHeaders,
  Kafka,
  logLevel,
  type Producer,
} from 'kafkajs';
import { createLogger } from '../../../clients/logger';
// One definition, not two: the consumer already declares the dead-letter
// message shape it hands to this producer, and both files are now siblings.
import type { DeadLetterMessage } from './consumer';
import type { IncomingEventPayload } from './incoming-event';

export type { Admin, EachBatchPayload, KafkaMessage } from 'kafkajs';

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
// Dead-letter topic for messages the consumer could not handle (ADR-004
// delivery semantics). Kept on the same broker so a poison message is retained
// and countable instead of dropped.
export const KAFKA_EVENTS_DLQ_TOPIC =
  process.env.KAFKA_EVENTS_DLQ_TOPIC || `${KAFKA_EVENTS_TOPIC}-dlq`;
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

// In-consumer retry for handler exceptions (ADR-004: at-least-once). Bounded
// so the worst case stays far inside KAFKA_SESSION_TIMEOUT_MS — a batch that
// out-waits the session timeout is a rebalance, which is worse than a DLQ.
export const KAFKA_HANDLER_MAX_ATTEMPTS = Number.parseInt(
  process.env.KAFKA_HANDLER_MAX_ATTEMPTS || '3',
  10
);
export const KAFKA_HANDLER_RETRY_INITIAL_MS = Number.parseInt(
  process.env.KAFKA_HANDLER_RETRY_INITIAL_MS || '100',
  10
);
export const KAFKA_HANDLER_RETRY_MAX_MS = Number.parseInt(
  process.env.KAFKA_HANDLER_RETRY_MAX_MS || '1000',
  10
);

const KAFKA_MIN_BYTES = KAFKA_MIN_MESSAGES * KAFKA_BYTES_PER_MESSAGE;
const KAFKA_MAX_BYTES_PER_PARTITION =
  KAFKA_MAX_MESSAGES_PER_PARTITION * KAFKA_BYTES_PER_MESSAGE;

// Kafka/Redpanda is the sole events transport (ADR-004): there is no fallback,
// so an unset KAFKA_BROKERS must fail loudly at boot rather than quietly at the
// first event.
export const assertKafkaConfigured = (): void => {
  if (KAFKA_BROKERS.length === 0) {
    throw new Error(
      'KAFKA_BROKERS is not set. Kafka/Redpanda is the only events transport — set KAFKA_BROKERS to a comma-separated broker list.'
    );
  }
};

let kafka: Kafka | null = null;
const getKafka = (): Kafka => {
  assertKafkaConfigured();
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

interface OutgoingMessage {
  key: Buffer | null;
  value: Buffer | null;
  headers?: IHeaders;
}

const send = async (topic: string, message: OutgoingMessage): Promise<void> => {
  const p = await getProducer();
  try {
    await p.send({
      topic,
      timeout: KAFKA_REQUEST_TIMEOUT_MS,
      messages: [message],
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

export const produceIncomingEvent = async (
  payload: IncomingEventPayload,
  partitionKey: string
): Promise<void> =>
  send(KAFKA_EVENTS_TOPIC, {
    key: Buffer.from(partitionKey),
    value: Buffer.from(JSON.stringify(payload)),
  });

// Why the reason/error/coordinates travel as headers and not in the value: the
// value stays the producer's original bytes, so a DLQ message can be replayed
// onto the events topic unchanged.
export const produceDeadLetterEvent = async (
  message: DeadLetterMessage
): Promise<void> =>
  send(KAFKA_EVENTS_DLQ_TOPIC, {
    key: message.key,
    value: message.value,
    headers: {
      ...message.headers,
      'dlq-source-topic': message.topic,
      'dlq-source-partition': String(message.partition),
      'dlq-source-offset': message.offset,
      'dlq-reason': message.reason,
      'dlq-error': message.error,
      'dlq-at': new Date().toISOString(),
    },
  });

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

// ── Consumer-group lag (backpressure visibility) ────────────────────────────
// A fast producer can hide a lagging consumer entirely — throughput numbers
// alone don't show it. `sampleConsumerGroupLag` reads the same end-offset-
// minus-committed-offset a broker-side tool (e.g. `rpk group describe`) would
// report, via the admin API this package already depends on, so a caller can
// poll it on an interval without shelling out to broker tooling.
export interface PartitionLag {
  partition: number;
  endOffset: number;
  committedOffset: number;
  lag: number;
}

export interface ConsumerGroupLag {
  sampledAt: number;
  totalLag: number;
  partitions: PartitionLag[];
}

export const createKafkaAdmin = (): Admin => getKafka().admin();

export const sampleConsumerGroupLag = async (
  admin: Admin,
  topic: string = KAFKA_EVENTS_TOPIC,
  groupId: string = KAFKA_CONSUMER_GROUP
): Promise<ConsumerGroupLag> => {
  const [endOffsets, committedByTopic] = await Promise.all([
    admin.fetchTopicOffsets(topic),
    admin.fetchOffsets({ groupId, topics: [topic] }),
  ]);
  const committed = new Map<number, number>();
  for (const p of committedByTopic[0]?.partitions ?? []) {
    committed.set(p.partition, Number(p.offset));
  }
  const partitions: PartitionLag[] = endOffsets.map((eo) => {
    const endOffset = Number(eo.offset);
    const lowWatermark = Number(eo.low);
    const rawCommitted = committed.get(eo.partition);
    // -1 means the group has never committed on this partition; treat the
    // whole backlog down to the low watermark as lag rather than computing
    // a bogus `endOffset - (-1)`.
    const committedOffset =
      rawCommitted === undefined || rawCommitted < 0
        ? lowWatermark
        : rawCommitted;
    return {
      partition: eo.partition,
      endOffset,
      committedOffset,
      lag: Math.max(0, endOffset - committedOffset),
    };
  });
  return {
    sampledAt: Date.now(),
    totalLag: partitions.reduce((sum, p) => sum + p.lag, 0),
    partitions,
  };
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
