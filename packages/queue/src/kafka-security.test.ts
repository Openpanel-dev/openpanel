import { describe, expect, it } from 'vitest';
import { describeKafkaSecurity, resolveKafkaSecurity } from './kafka-security';

const readFile = (path: string): string => {
  if (path === '/certs/ca.pem') {
    return '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----';
  }
  throw new Error(`ENOENT: no such file or directory, open '${path}'`);
};

describe('resolveKafkaSecurity', () => {
  it('defaults to plaintext without auth when nothing is configured', () => {
    expect(resolveKafkaSecurity({}, readFile)).toEqual({
      ssl: false,
      sasl: undefined,
    });
  });

  it('enables TLS only with KAFKA_SSL=true', () => {
    expect(resolveKafkaSecurity({ KAFKA_SSL: 'true' }, readFile)).toEqual({
      ssl: true,
      sasl: undefined,
    });
    expect(resolveKafkaSecurity({ KAFKA_SSL: '1' }, readFile).ssl).toBe(true);
  });

  it('passes a custom CA and rejectUnauthorized through to tls options', () => {
    expect(
      resolveKafkaSecurity(
        {
          KAFKA_SSL: 'true',
          KAFKA_SSL_CA_PATH: '/certs/ca.pem',
          KAFKA_SSL_REJECT_UNAUTHORIZED: 'false',
        },
        readFile
      ).ssl
    ).toEqual({
      ca: ['-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----'],
      rejectUnauthorized: false,
    });
  });

  it('fails with a clear error when the CA file cannot be read', () => {
    expect(() =>
      resolveKafkaSecurity(
        { KAFKA_SSL: 'true', KAFKA_SSL_CA_PATH: '/missing.pem' },
        readFile
      )
    ).toThrow(/Failed to read KAFKA_SSL_CA_PATH "\/missing.pem"/);
  });

  it('rejects TLS-only options when TLS is disabled', () => {
    expect(() =>
      resolveKafkaSecurity({ KAFKA_SSL_CA_PATH: '/certs/ca.pem' }, readFile)
    ).toThrow(/require TLS/);
    expect(() =>
      resolveKafkaSecurity(
        { KAFKA_SSL: 'false', KAFKA_SSL_REJECT_UNAUTHORIZED: 'false' },
        readFile
      )
    ).toThrow(/require TLS/);
  });

  it('rejects non-boolean KAFKA_SSL values', () => {
    expect(() => resolveKafkaSecurity({ KAFKA_SSL: 'yes' }, readFile)).toThrow(
      /KAFKA_SSL must be "true" or "false"/
    );
  });

  it('defaults SASL to scram-sha-512 over TLS when credentials are present', () => {
    expect(
      resolveKafkaSecurity(
        { KAFKA_SASL_USERNAME: 'op', KAFKA_SASL_PASSWORD: 'secret' },
        readFile
      )
    ).toEqual({
      ssl: true,
      sasl: { mechanism: 'scram-sha-512', username: 'op', password: 'secret' },
    });
  });

  it.each([
    'plain',
    'scram-sha-256',
    'scram-sha-512',
  ] as const)('supports mechanism %s (case-insensitive)', (mechanism) => {
    const config = resolveKafkaSecurity(
      {
        KAFKA_SASL_USERNAME: 'op',
        KAFKA_SASL_PASSWORD: 'secret',
        KAFKA_SASL_MECHANISM: mechanism.toUpperCase(),
      },
      readFile
    );
    expect(config.sasl?.mechanism).toBe(mechanism);
    expect(config.ssl).toBe(true);
  });

  it('allows SASL over plaintext when KAFKA_SSL=false is explicit', () => {
    expect(
      resolveKafkaSecurity(
        {
          KAFKA_SSL: 'false',
          KAFKA_SASL_USERNAME: 'op',
          KAFKA_SASL_PASSWORD: 'secret',
          KAFKA_SASL_MECHANISM: 'plain',
        },
        readFile
      )
    ).toEqual({
      ssl: false,
      sasl: { mechanism: 'plain', username: 'op', password: 'secret' },
    });
  });

  it('rejects unsupported mechanisms before creating a client', () => {
    expect(() =>
      resolveKafkaSecurity(
        {
          KAFKA_SASL_USERNAME: 'op',
          KAFKA_SASL_PASSWORD: 'secret',
          KAFKA_SASL_MECHANISM: 'oauthbearer',
        },
        readFile
      )
    ).toThrow(
      'Unsupported KAFKA_SASL_MECHANISM "oauthbearer". Supported: plain, scram-sha-256, scram-sha-512'
    );
  });

  it('fails fast when only one of username/password is set', () => {
    expect(() =>
      resolveKafkaSecurity({ KAFKA_SASL_USERNAME: 'op' }, readFile)
    ).toThrow(/KAFKA_SASL_PASSWORD is missing/);
    expect(() =>
      resolveKafkaSecurity({ KAFKA_SASL_PASSWORD: 'secret' }, readFile)
    ).toThrow(/KAFKA_SASL_USERNAME is missing/);
  });

  it('fails fast when a mechanism is set without credentials', () => {
    expect(() =>
      resolveKafkaSecurity({ KAFKA_SASL_MECHANISM: 'plain' }, readFile)
    ).toThrow(/KAFKA_SASL_MECHANISM is set but/);
  });

  it('never leaks credentials in error messages', () => {
    const env = {
      KAFKA_SASL_USERNAME: 'op',
      KAFKA_SASL_PASSWORD: 'hunter2-secret',
      KAFKA_SASL_MECHANISM: 'nope',
    };
    let message = '';
    try {
      resolveKafkaSecurity(env, readFile);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toContain('hunter2-secret');
  });
});

describe('describeKafkaSecurity', () => {
  it('summarises without credential values', () => {
    const config = resolveKafkaSecurity(
      { KAFKA_SASL_USERNAME: 'op', KAFKA_SASL_PASSWORD: 'secret' },
      readFile
    );
    expect(describeKafkaSecurity(config)).toEqual({
      ssl: true,
      sasl: 'scram-sha-512',
    });
    expect(JSON.stringify(describeKafkaSecurity(config))).not.toContain(
      'secret'
    );
    expect(describeKafkaSecurity(resolveKafkaSecurity({}, readFile))).toEqual({
      ssl: false,
      sasl: null,
    });
  });
});
