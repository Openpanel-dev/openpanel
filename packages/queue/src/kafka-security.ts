import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import type { SASLOptions } from 'kafkajs';

// Env-driven TLS/SASL config for external Kafka brokers. Kept free of any
// project imports so it can be unit-tested in isolation.
//
// Supported modes (all opt-in via env, unauthenticated plaintext by default):
//   - TLS only                      KAFKA_SSL=true
//   - SASL/PLAIN over TLS           KAFKA_SASL_MECHANISM=plain + credentials
//   - SASL/SCRAM-SHA-256 over TLS   KAFKA_SASL_MECHANISM=scram-sha-256 + credentials
//   - SASL/SCRAM-SHA-512 over TLS   KAFKA_SASL_MECHANISM=scram-sha-512 + credentials (default)
// TLS is implied when SASL credentials are present; set KAFKA_SSL=false to
// send SASL over plaintext (dev/internal networks only).

export const KAFKA_SASL_MECHANISMS = [
  'plain',
  'scram-sha-256',
  'scram-sha-512',
] as const;
export type KafkaSaslMechanism = (typeof KAFKA_SASL_MECHANISMS)[number];
const DEFAULT_SASL_MECHANISM: KafkaSaslMechanism = 'scram-sha-512';

// Shape-compatible with process.env. Keys read:
//   KAFKA_SSL, KAFKA_SSL_CA_PATH, KAFKA_SSL_REJECT_UNAUTHORIZED,
//   KAFKA_SASL_USERNAME, KAFKA_SASL_PASSWORD, KAFKA_SASL_MECHANISM
export type KafkaSecurityEnv = Readonly<Record<string, string | undefined>>;

export type KafkaSecurityConfig = {
  ssl: ConnectionOptions | boolean;
  sasl: SASLOptions | undefined;
};

const isSaslMechanism = (value: string): value is KafkaSaslMechanism =>
  (KAFKA_SASL_MECHANISMS as readonly string[]).includes(value);

const parseBoolean = (
  name: string,
  raw: string | undefined
): boolean | undefined => {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  throw new Error(`${name} must be "true" or "false" (got "${raw}")`);
};

const resolveSasl = (env: KafkaSecurityEnv): SASLOptions | undefined => {
  const username = env.KAFKA_SASL_USERNAME;
  const password = env.KAFKA_SASL_PASSWORD;
  const hasUsername = Boolean(username);
  const hasPassword = Boolean(password);

  if (!(hasUsername || hasPassword)) {
    if (env.KAFKA_SASL_MECHANISM) {
      throw new Error(
        'KAFKA_SASL_MECHANISM is set but KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are missing'
      );
    }
    return undefined;
  }
  if (!(hasUsername && hasPassword)) {
    const missing = hasUsername ? 'KAFKA_SASL_PASSWORD' : 'KAFKA_SASL_USERNAME';
    throw new Error(
      `Kafka SASL is partially configured: ${missing} is missing (both KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD are required)`
    );
  }

  const rawMechanism = env.KAFKA_SASL_MECHANISM?.trim().toLowerCase();
  const mechanism = rawMechanism || DEFAULT_SASL_MECHANISM;
  if (!isSaslMechanism(mechanism)) {
    throw new Error(
      `Unsupported KAFKA_SASL_MECHANISM "${env.KAFKA_SASL_MECHANISM}". Supported: ${KAFKA_SASL_MECHANISMS.join(', ')}`
    );
  }

  return {
    mechanism,
    username: username as string,
    password: password as string,
  };
};

const resolveSsl = (
  env: KafkaSecurityEnv,
  saslEnabled: boolean,
  readFile: (path: string) => string
): ConnectionOptions | boolean => {
  // SASL credentials go over TLS unless explicitly opted out.
  const enabled = parseBoolean('KAFKA_SSL', env.KAFKA_SSL) ?? saslEnabled;
  const caPath = env.KAFKA_SSL_CA_PATH?.trim();
  const rejectUnauthorized = parseBoolean(
    'KAFKA_SSL_REJECT_UNAUTHORIZED',
    env.KAFKA_SSL_REJECT_UNAUTHORIZED
  );

  if (!enabled) {
    if (caPath || rejectUnauthorized !== undefined) {
      throw new Error(
        'KAFKA_SSL_CA_PATH / KAFKA_SSL_REJECT_UNAUTHORIZED require TLS; set KAFKA_SSL=true'
      );
    }
    return false;
  }

  const options: ConnectionOptions = {};
  if (caPath) {
    try {
      options.ca = [readFile(caPath)];
    } catch (err) {
      throw new Error(
        `Failed to read KAFKA_SSL_CA_PATH "${caPath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (rejectUnauthorized !== undefined) {
    options.rejectUnauthorized = rejectUnauthorized;
  }
  return Object.keys(options).length > 0 ? options : true;
};

const readPemFile = (path: string): string => readFileSync(path, 'utf8');

/**
 * Build the kafkajs `ssl` / `sasl` options from env. Throws a descriptive
 * Error on inconsistent configuration so misconfiguration surfaces at
 * startup instead of as an opaque broker handshake failure.
 */
export const resolveKafkaSecurity = (
  env: KafkaSecurityEnv,
  readFile: (path: string) => string = readPemFile
): KafkaSecurityConfig => {
  const sasl = resolveSasl(env);
  const ssl = resolveSsl(env, sasl !== undefined, readFile);
  return { ssl, sasl };
};

/** Log-safe summary: never includes credential values. */
export const describeKafkaSecurity = (
  config: KafkaSecurityConfig
): { ssl: boolean; sasl: KafkaSaslMechanism | null } => ({
  ssl: config.ssl !== false,
  sasl: config.sasl ? (config.sasl.mechanism as KafkaSaslMechanism) : null,
});
