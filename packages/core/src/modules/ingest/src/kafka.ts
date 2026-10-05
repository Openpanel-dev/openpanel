// NOTHING here constructs a Kafka client at import time: `getKafka` is lazy and
// only `assertKafkaConfigured` reads the broker list eagerly, so core stays
// importable with no broker and `bun test` still runs offline.

import {
  type Admin,
  type Consumer,
  type IHeaders,
  Kafka,
  logLevel,
  type Producer,
} from 'kafkajs';
import type { CoreConfig, KafkaConfig } from '../../../config';
import { createLogger, type ILogger } from '../../../pino-logger';
// One definition, not two: the consumer already declares the dead-letter
// message shape it hands to this producer.
import type { DeadLetterMessage } from './consumer';
import type { IncomingEventPayload } from './incoming-event';
import {
  describeKafkaSecurity,
  type ResolvedKafkaSecurity,
  resolveKafkaSecurity,
} from './kafka-security';
import {
  createProducerBatcher,
  type ProducerBatcher,
} from './producer-batcher';
import { sendWithFatalRecovery } from './producer-errors';
import {
  type ResolvedProducerTuning,
  resolveProducerTuning,
} from './producer-tuning';

export type { Admin, EachBatchPayload, KafkaMessage } from 'kafkajs';

// Approx size of one event payload (observed range ~0.9–1.3 KiB).
// We size fetch knobs in messages and convert to bytes via this constant.
const KAFKA_BYTES_PER_MESSAGE = 1024;

// One logger and one client per process, built on first use from the config
// the caller was handed. `loadConfig` runs once at boot, so the memo cannot
// serve one caller another caller's brokers.
let kafkaLoggerInstance: ILogger | null = null;
export const kafkaLogger = (config: CoreConfig): ILogger => {
  kafkaLoggerInstance ??= createLogger({ name: 'kafka', config });
  return kafkaLoggerInstance;
};

// Kafka/Redpanda is the sole events transport: there is no fallback, so an
// unset KAFKA_BROKERS must fail loudly at boot rather than quietly at the first
// event.
export const assertKafkaConfigured = (config: KafkaConfig): void => {
  if (config.brokers.length === 0) {
    throw new Error(
      'KAFKA_BROKERS is not set. Kafka/Redpanda is the only events transport — set KAFKA_BROKERS to a comma-separated broker list.'
    );
  }
  // Reads the CA file, so an unreadable KAFKA_SSL_CA_PATH fails here at boot
  // rather than on the first produce/consume.
  getKafkaSecurity(config);
};

// Memoised like the client below: the CA file is read once per process.
let kafkaSecurity: ResolvedKafkaSecurity | null = null;
const getKafkaSecurity = (config: KafkaConfig): ResolvedKafkaSecurity => {
  kafkaSecurity ??= resolveKafkaSecurity(config.security);
  return kafkaSecurity;
};

let kafka: Kafka | null = null;
const getKafka = (config: CoreConfig): Kafka => {
  assertKafkaConfigured(config.kafka);
  if (!kafka) {
    const security = getKafkaSecurity(config.kafka);
    kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      logLevel: logLevel.WARN,
      requestTimeout: config.kafka.requestTimeoutMs,
      connectionTimeout: config.kafka.connectionTimeoutMs,
      ssl: security.ssl,
      sasl: security.sasl,
    });
  }
  return kafka;
};

let producer: Producer | null = null;
let producerConnectPromise: Promise<Producer> | null = null;

const getProducer = async (config: CoreConfig): Promise<Producer> => {
  if (producer) {
    return producer;
  }
  if (!producerConnectPromise) {
    const client = getKafka(config);
    const tuning = resolveProducerTuning(config.kafka);
    const p = client.producer({
      idempotent: true,
      // Stays 1 (not 5) to avoid in-flight reordering after a transient broker
      // hiccup: with idempotency on and low retries, reordered batches trip
      // OUT_OF_ORDER_SEQUENCE_NUMBER and stick the producer per-partition.
      // Raising it gained only a couple percent of throughput and was
      // rejected; batching is what amortises the round-trip.
      // KAFKA_PRODUCER_MAX_IN_FLIGHT still raises it for a measurement run, but it
      // is coupled to the retry policy.
      maxInFlightRequests: tuning.maxInFlight,
      allowAutoTopicCreation: true,
      retry: {
        retries: config.kafka.producerRetries,
        initialRetryTime: config.kafka.producerInitialRetryMs,
        maxRetryTime: config.kafka.producerMaxRetryMs,
        factor: 2,
      },
    });
    producerConnectPromise = p
      .connect()
      .then(() => {
        producer = p;
        kafkaLogger(config).info(
          {
            brokers: config.kafka.brokers,
            topic: config.kafka.eventsTopic,
            // `ssl: bool` and the mechanism only — never a credential.
            ...describeKafkaSecurity(getKafkaSecurity(config.kafka)),
            // The throughput knobs, logged once, so a measurement run can be
            // tied to the configuration that produced it.
            maxInFlight: tuning.maxInFlight,
            batchSize: tuning.batchSize,
            batchLingerMs: tuning.lingerMs,
            batching: tuning.batchingEnabled,
          },
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

const resetProducer = (config: CoreConfig, broken: Producer): void => {
  if (producer !== broken) {
    return;
  }
  producer = null;
  producerConnectPromise = null;
  broken.disconnect().catch((err) => {
    kafkaLogger(config).warn(
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

// One send, one or many messages. The batching path (below) and the
// unbatched path are the same call, so a batch that fails resets the producer
// exactly like a lone message did.
const sendMessages = (
  config: CoreConfig,
  topic: string,
  messages: OutgoingMessage[]
): Promise<void> =>
  getProducer(config).then((p) =>
    sendWithFatalRecovery(
      async () => {
        await p.send({
          topic,
          timeout: config.kafka.requestTimeoutMs,
          messages,
        });
      },
      (err) => {
        kafkaLogger(config).warn(
          { err },
          'kafka producer in fatal state; resetting for next call'
        );
        resetProducer(config, p);
      }
    )
  );

// Built on the first batched produce, from the tuning the config carries.
// Only the events topic batches: the dead-letter path is low volume and its
// messages are produced one poison record at a time, so it has no round-trip
// to amortise.
let eventsBatcher: ProducerBatcher<OutgoingMessage> | null = null;

const getEventsBatcher = (
  config: CoreConfig,
  tuning: ResolvedProducerTuning
): ProducerBatcher<OutgoingMessage> => {
  eventsBatcher ??= createProducerBatcher<OutgoingMessage>({
    batchSize: tuning.batchSize,
    lingerMs: tuning.lingerMs,
    send: (messages) =>
      sendMessages(config, config.kafka.eventsTopic, messages),
  });
  return eventsBatcher;
};

export const produceIncomingEvent = async (
  config: CoreConfig,
  payload: IncomingEventPayload,
  partitionKey: string
): Promise<void> => {
  const message: OutgoingMessage = {
    key: Buffer.from(partitionKey),
    value: Buffer.from(JSON.stringify(payload)),
  };
  const tuning = resolveProducerTuning(config.kafka);
  if (!tuning.batchingEnabled) {
    await sendMessages(config, config.kafka.eventsTopic, [message]);
    return;
  }
  await getEventsBatcher(config, tuning).enqueue(message);
};

// Why the reason/error/coordinates travel as headers and not in the value: the
// value stays the producer's original bytes, so a DLQ message can be replayed
// onto the events topic unchanged.
export const produceDeadLetterEvent = async (
  config: CoreConfig,
  message: DeadLetterMessage
): Promise<void> =>
  sendMessages(config, config.kafka.eventsDlqTopic, [
    {
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
    },
  ]);

const consumers = new Set<Consumer>();

export const createKafkaEventsConsumer = (
  config: CoreConfig,
  options?: {
    groupId?: string;
  }
): Consumer => {
  const client = getKafka(config);
  const consumer = client.consumer({
    groupId: options?.groupId || config.kafka.consumerGroup,
    sessionTimeout: config.kafka.sessionTimeoutMs,
    heartbeatInterval: config.kafka.heartbeatIntervalMs,
    minBytes: config.kafka.minMessages * KAFKA_BYTES_PER_MESSAGE,
    maxWaitTimeInMs: config.kafka.maxWaitMs,
    maxBytesPerPartition:
      config.kafka.maxMessagesPerPartition * KAFKA_BYTES_PER_MESSAGE,
  });
  consumers.add(consumer);
  // Whoever opens closes: a consumer that disconnected on its own (the events
  // handle's `stop()`) drops out of the set so shutdown never disconnects it
  // twice and the set never retains a dead consumer.
  consumer.on(consumer.events.DISCONNECT, () => {
    consumers.delete(consumer);
  });
  return consumer;
};

// Consumer-group lag (backpressure visibility)
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

export const createKafkaAdmin = (config: CoreConfig): Admin =>
  getKafka(config).admin();

export const sampleConsumerGroupLag = async (
  admin: Admin,
  topic: string,
  groupId: string
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

export const disconnectKafka = async (config: CoreConfig): Promise<void> => {
  // Whatever is still accumulating goes out before the producer closes, so a
  // shutdown inside the linger window cannot strand an accepted event.
  if (eventsBatcher) {
    const batcher = eventsBatcher;
    eventsBatcher = null;
    await batcher.flush().catch((err) => {
      kafkaLogger(config).error({ err }, 'kafka producer batch flush failed');
    });
  }
  const tasks: Promise<unknown>[] = [];
  for (const c of consumers) {
    tasks.push(
      c.disconnect().catch((err) => {
        kafkaLogger(config).error({ err }, 'kafka consumer disconnect error');
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
        kafkaLogger(config).error({ err }, 'kafka producer disconnect error');
      })
    );
  }
  await Promise.all(tasks);
};
