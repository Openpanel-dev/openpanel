import { connect } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Round-trips a message through the real producer/consumer in kafka.ts against
// a broker that requires SASL, in every supported TLS/SASL mode.
//
// Needs the opt-in `op-rp-auth` compose service (docker/redpanda/auth-entrypoint.sh):
//   pnpm dock:kafka-auth
// It exposes a plaintext and a TLS SASL listener, writes its self-signed CA to
// docker/data/op-rp-auth-certs and creates the users below. When the broker is
// not running this file is skipped.
const PLAIN_BROKER = 'localhost:19093';
const TLS_BROKER = 'localhost:19094';
const CA_PATH = path.resolve(
  __dirname,
  '../../../docker/data/op-rp-auth-certs/ca.crt'
);
const USER_512 = { username: 'op512', password: 'op512-secret' };
const USER_256 = { username: 'op256', password: 'op256-secret' };

const isBrokerUp = (): Promise<boolean> =>
  new Promise((resolve) => {
    const [host, port] = PLAIN_BROKER.split(':');
    const socket = connect({ host, port: Number(port), timeout: 1000 });
    const done = (up: boolean) => {
      socket.destroy();
      resolve(up);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });

const brokerUp = await isBrokerUp();
if (!brokerUp) {
  console.warn(
    'kafka.integration.test.ts skipped: op-rp-auth is not running (pnpm dock:kafka-auth)'
  );
}

const ROUND_TRIP_TIMEOUT_MS = 30_000;

const KAFKA_ENV_KEYS = [
  'KAFKA_BROKERS',
  'KAFKA_EVENTS_TOPIC',
  'KAFKA_CONSUMER_GROUP',
  'KAFKA_SSL',
  'KAFKA_SSL_CA_PATH',
  'KAFKA_SSL_REJECT_UNAUTHORIZED',
  'KAFKA_SASL_USERNAME',
  'KAFKA_SASL_PASSWORD',
  'KAFKA_SASL_MECHANISM',
] as const;

type KafkaModule = typeof import('./kafka');

let active: KafkaModule | null = null;

const loadKafka = async (
  env: Partial<Record<(typeof KAFKA_ENV_KEYS)[number], string>>
): Promise<KafkaModule> => {
  vi.resetModules();
  for (const key of KAFKA_ENV_KEYS) {
    vi.stubEnv(key, env[key] ?? '');
    if (env[key] === undefined) {
      // stubEnv('') leaves an empty string, which our parser treats as unset.
      delete process.env[key];
    }
  }
  const mod = await import('./kafka');
  active = mod;
  return mod;
};

const uniqueTopic = () =>
  `op-sasl-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Produce one event, then consume it back from the beginning of the topic.
// Returns both so the caller can assert they match.
const roundTrip = async (
  mod: KafkaModule
): Promise<{ sent: Record<string, unknown>; received: unknown }> => {
  const payload = { marker: `marker-${Date.now()}` };
  await mod.produceIncomingEvent(
    payload as unknown as Parameters<typeof mod.produceIncomingEvent>[0],
    'partition-key'
  );

  const consumer = mod.createKafkaEventsConsumer({
    groupId: `${mod.KAFKA_CONSUMER_GROUP}-${Math.random().toString(36).slice(2, 8)}`,
  });
  await consumer.connect();
  await consumer.subscribe({
    topic: mod.KAFKA_EVENTS_TOPIC,
    fromBeginning: true,
  });

  const received = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('timed out waiting for message')),
      ROUND_TRIP_TIMEOUT_MS
    );
    consumer
      .run({
        eachMessage: async ({ message }) => {
          clearTimeout(timer);
          resolve(JSON.parse(message.value?.toString() ?? '{}'));
        },
      })
      .catch(reject);
  });

  return { sent: payload, received: await received };
};

afterEach(async () => {
  if (active) {
    await active.disconnectKafka();
    active = null;
  }
  vi.unstubAllEnvs();
});

describe.skipIf(!brokerUp)('kafka TLS/SASL integration', () => {
  it(
    'SASL/SCRAM-SHA-512 over plaintext (KAFKA_SSL=false)',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: PLAIN_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL: 'false',
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: USER_512.password,
      });
      const { sent, received } = await roundTrip(mod);
      expect(received).toEqual(sent);
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'SASL/SCRAM-SHA-512 over TLS is the default when credentials are set',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL_CA_PATH: CA_PATH,
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: USER_512.password,
      });
      const { sent, received } = await roundTrip(mod);
      expect(received).toEqual(sent);
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'SASL/SCRAM-SHA-256 over TLS',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL: 'true',
        KAFKA_SSL_CA_PATH: CA_PATH,
        KAFKA_SASL_MECHANISM: 'scram-sha-256',
        KAFKA_SASL_USERNAME: USER_256.username,
        KAFKA_SASL_PASSWORD: USER_256.password,
      });
      const { sent, received } = await roundTrip(mod);
      expect(received).toEqual(sent);
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'SASL/PLAIN over TLS',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL_CA_PATH: CA_PATH,
        KAFKA_SASL_MECHANISM: 'plain',
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: USER_512.password,
      });
      const { sent, received } = await roundTrip(mod);
      expect(received).toEqual(sent);
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'TLS with an untrusted (self-signed) CA is rejected by default',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: USER_512.password,
      });
      await expect(mod.produceIncomingEvent({} as never, 'k')).rejects.toThrow(
        /self[- ]signed|certificate|unable to verify/i
      );
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'TLS with an untrusted CA works with KAFKA_SSL_REJECT_UNAUTHORIZED=false',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL_REJECT_UNAUTHORIZED: 'false',
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: USER_512.password,
      });
      const { sent, received } = await roundTrip(mod);
      expect(received).toEqual(sent);
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'wrong SASL password fails authentication',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL_CA_PATH: CA_PATH,
        KAFKA_SASL_USERNAME: USER_512.username,
        KAFKA_SASL_PASSWORD: 'definitely-wrong',
      });
      await expect(mod.produceIncomingEvent({} as never, 'k')).rejects.toThrow(
        /SASL|authentication/i
      );
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it(
    'unauthenticated client is rejected by a SASL-only broker',
    async () => {
      const mod = await loadKafka({
        KAFKA_BROKERS: TLS_BROKER,
        KAFKA_EVENTS_TOPIC: uniqueTopic(),
        KAFKA_SSL: 'true',
        KAFKA_SSL_CA_PATH: CA_PATH,
      });
      await expect(
        mod.produceIncomingEvent({} as never, 'k')
      ).rejects.toThrow();
    },
    ROUND_TRIP_TIMEOUT_MS + 5000
  );

  it('partial SASL config fails at module load', async () => {
    await expect(
      loadKafka({
        KAFKA_BROKERS: PLAIN_BROKER,
        KAFKA_SASL_USERNAME: USER_512.username,
      })
    ).rejects.toThrow(/KAFKA_SASL_PASSWORD is missing/);
    active = null;
  });
});
