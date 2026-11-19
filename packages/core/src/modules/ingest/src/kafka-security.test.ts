import { describe, expect, it } from 'bun:test';
import type { KafkaSecurityConfig } from '../../../config';
import { describeKafkaSecurity, resolveKafkaSecurity } from './kafka-security';

const FAKE_PEM = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----';

const readFile = (path: string): string => {
  if (path === '/certs/ca.pem') {
    return FAKE_PEM;
  }
  throw new Error(`ENOENT: no such file or directory, open '${path}'`);
};

const plaintext: KafkaSecurityConfig = {
  ssl: { enabled: false, caPath: undefined, rejectUnauthorized: undefined },
  sasl: undefined,
};

const withSasl = (
  mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512',
  ssl: KafkaSecurityConfig['ssl'] = {
    enabled: true,
    caPath: undefined,
    rejectUnauthorized: undefined,
  }
): KafkaSecurityConfig => ({
  ssl,
  sasl: { mechanism, username: 'op', password: 'secret' },
});

describe('resolveKafkaSecurity', () => {
  it('is plaintext without auth when nothing is configured', () => {
    expect(resolveKafkaSecurity(plaintext, readFile)).toEqual({
      ssl: false,
      sasl: undefined,
    });
  });

  it('is a bare `true` for TLS with the system trust store', () => {
    expect(
      resolveKafkaSecurity(
        { ...plaintext, ssl: { ...plaintext.ssl, enabled: true } },
        readFile
      )
    ).toEqual({ ssl: true, sasl: undefined });
  });

  it('passes a custom CA and rejectUnauthorized through to tls options', () => {
    expect(
      resolveKafkaSecurity(
        {
          ...plaintext,
          ssl: {
            enabled: true,
            caPath: '/certs/ca.pem',
            rejectUnauthorized: false,
          },
        },
        readFile
      ).ssl
    ).toEqual({ ca: [FAKE_PEM], rejectUnauthorized: false });
  });

  it('fails with the path when the CA file cannot be read', () => {
    expect(() =>
      resolveKafkaSecurity(
        {
          ...plaintext,
          ssl: {
            enabled: true,
            caPath: '/missing.pem',
            rejectUnauthorized: undefined,
          },
        },
        readFile
      )
    ).toThrow(/Failed to read KAFKA_SSL_CA_PATH "\/missing.pem"/);
  });

  it('hands SASL credentials to kafkajs unchanged, per mechanism', () => {
    for (const mechanism of [
      'plain',
      'scram-sha-256',
      'scram-sha-512',
    ] as const) {
      expect(resolveKafkaSecurity(withSasl(mechanism), readFile)).toEqual({
        ssl: true,
        sasl: { mechanism, username: 'op', password: 'secret' },
      });
    }
  });

  it('allows SASL over plaintext when the loader resolved TLS off', () => {
    expect(
      resolveKafkaSecurity(withSasl('plain', plaintext.ssl), readFile)
    ).toEqual({
      ssl: false,
      sasl: { mechanism: 'plain', username: 'op', password: 'secret' },
    });
  });
});

describe('describeKafkaSecurity', () => {
  it('summarises without credential values', () => {
    const resolved = resolveKafkaSecurity(withSasl('scram-sha-512'), readFile);
    expect(describeKafkaSecurity(resolved)).toEqual({
      ssl: true,
      sasl: 'scram-sha-512',
    });
    expect(JSON.stringify(describeKafkaSecurity(resolved))).not.toContain(
      'secret'
    );
    expect(
      describeKafkaSecurity(resolveKafkaSecurity(plaintext, readFile))
    ).toEqual({ ssl: false, sasl: null });
  });
});
