// The kafkajs `ssl` / `sasl` options for an external broker, built from the
// already-validated `KafkaSecurityConfig`. The only thing that can still fail
// here is reading the CA file, and it fails with the path in the message.

import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import type { SASLOptions } from 'kafkajs';
import type { KafkaSaslMechanism, KafkaSecurityConfig } from '../../../config';

export interface ResolvedKafkaSecurity {
  ssl: ConnectionOptions | boolean;
  sasl: SASLOptions | undefined;
}

export type ReadPemFile = (path: string) => string;

const readPemFile: ReadPemFile = (path) => readFileSync(path, 'utf8');

const resolveSsl = (
  ssl: KafkaSecurityConfig['ssl'],
  readFile: ReadPemFile
): ConnectionOptions | boolean => {
  if (!ssl.enabled) {
    return false;
  }
  const options: ConnectionOptions = {};
  if (ssl.caPath) {
    try {
      options.ca = [readFile(ssl.caPath)];
    } catch (err) {
      throw new Error(
        `Failed to read KAFKA_SSL_CA_PATH "${ssl.caPath}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (ssl.rejectUnauthorized !== undefined) {
    options.rejectUnauthorized = ssl.rejectUnauthorized;
  }
  return Object.keys(options).length > 0 ? options : true;
};

export const resolveKafkaSecurity = (
  security: KafkaSecurityConfig,
  readFile: ReadPemFile = readPemFile
): ResolvedKafkaSecurity => ({
  ssl: resolveSsl(security.ssl, readFile),
  sasl: security.sasl
    ? {
        mechanism: security.sasl.mechanism,
        username: security.sasl.username,
        password: security.sasl.password,
      }
    : undefined,
});

/** Log-safe summary: never includes credential values. */
export const describeKafkaSecurity = (
  security: ResolvedKafkaSecurity
): { ssl: boolean; sasl: KafkaSaslMechanism | null } => ({
  ssl: security.ssl !== false,
  sasl: security.sasl ? (security.sasl.mechanism as KafkaSaslMechanism) : null,
});
