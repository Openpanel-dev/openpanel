import { beforeAll, describe, expect, it } from 'vitest';
import {
  carryOverConfigSecrets,
  encryptConfigSecrets,
  findEncryptedSecretField,
  findMissingSecretFields,
  redactConfigSecrets,
} from './registry';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

const gcs = (serviceAccountKey: string) =>
  ({
    type: 'gcs_export',
    bucket: 'b',
    prefix: 'p',
    format: 'jsonl_gzip',
    serviceAccountKey,
  }) as const;

const s3AccessKey = (secretAccessKey: string) =>
  ({
    type: 's3_export',
    bucket: 'b',
    prefix: 'p',
    region: 'us-east-1',
    format: 'jsonl_gzip',
    encryption: 'SSE-S3',
    authMode: 'access_key',
    accessKeyId: 'AKIA',
    secretAccessKey,
  }) as const;

const s3IamRole = {
  type: 's3_export',
  bucket: 'b',
  prefix: 'p',
  region: 'us-east-1',
  format: 'jsonl_gzip',
  encryption: 'SSE-S3',
  authMode: 'iam_role',
  roleArn: 'arn:aws:iam::1:role/x',
} as const;

describe('config secret handling', () => {
  it('redacts declared secrets so they never reach a client', () => {
    expect(redactConfigSecrets(gcs('super-secret')).serviceAccountKey).toBe('');
    expect(redactConfigSecrets(s3AccessKey('shhh')).secretAccessKey).toBe('');
  });

  it('leaves configs without secrets untouched, by identity', () => {
    // The router returns the row as-is when nothing changed, so identity matters.
    expect(redactConfigSecrets(s3IamRole)).toBe(s3IamRole);
    expect(redactConfigSecrets({ type: 'slack' })).toEqual({ type: 'slack' });
  });

  it('is lenient for an empty/unknown config (Slack pre-OAuth is {})', () => {
    expect(() => redactConfigSecrets({})).not.toThrow();
    expect(() => findEncryptedSecretField({})).not.toThrow();
    expect(findMissingSecretFields({})).toEqual([]);
    expect(findMissingSecretFields({ type: 'nope' })).toEqual([]);
  });

  it('encrypts declared secrets before persisting', () => {
    const encrypted = encryptConfigSecrets(gcs('super-secret'));
    expect(encrypted.serviceAccountKey.startsWith('enc:')).toBe(true);
    expect(encrypted.serviceAccountKey).not.toContain('super-secret');
  });

  it('carries a blank secret over from the stored row on update', () => {
    const stored = encryptConfigSecrets(gcs('super-secret'));
    const submitted = carryOverConfigSecrets(gcs(''), stored);
    expect(submitted.serviceAccountKey).toBe(stored.serviceAccountKey);
  });

  it('does not let a submitted secret be overwritten by the stored one', () => {
    const stored = encryptConfigSecrets(gcs('old'));
    const submitted = carryOverConfigSecrets(gcs('new-key'), stored);
    expect(submitted.serviceAccountKey).toBe('new-key');
  });

  it('reports a blank secret with nothing stored to fall back to', () => {
    expect(findMissingSecretFields(carryOverConfigSecrets(gcs(''), null))).toEqual([
      'serviceAccountKey',
    ]);
    expect(findMissingSecretFields(gcs('key'))).toEqual([]);
    // iam_role has no secret field on the object at all.
    expect(findMissingSecretFields(s3IamRole)).toEqual([]);
  });

  it('redacts a nested secret without disturbing its siblings', () => {
    const slack = {
      type: 'slack',
      access_token: 'xoxb-super-secret',
      team: { id: 'T1', name: 'Acme' },
      incoming_webhook: {
        channel: '#alerts',
        channel_id: 'C1',
        configuration_url: 'https://acme.slack.com/services/B1',
        url: 'https://hooks.slack.com/services/T1/B1/secret',
      },
    };
    const redacted = redactConfigSecrets(slack);

    expect(redacted.access_token).toBe('');
    expect(redacted.incoming_webhook.url).toBe('');
    // Everything the UI needs stays intact.
    expect(redacted.incoming_webhook.channel).toBe('#alerts');
    expect(redacted.incoming_webhook.configuration_url).toBe(
      'https://acme.slack.com/services/B1',
    );
    expect(redacted.team).toEqual({ id: 'T1', name: 'Acme' });
    // The original is untouched — the worker reads the stored row, not this.
    expect(slack.incoming_webhook.url).toBe(
      'https://hooks.slack.com/services/T1/B1/secret',
    );
  });

  it('redacts webhook header values but keeps the keys visible', () => {
    const redacted = redactConfigSecrets({
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123', 'X-Env': 'prod' },
    });

    expect(redacted.headers).toEqual({ Authorization: '', 'X-Env': '' });
    // The destination URL is not redacted: the user typed it and must be able
    // to edit it.
    expect(redacted.url).toBe('https://acme.test/hook');
  });

  it('carries header values over per key, so an edit keeps the others', () => {
    const stored = {
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123', 'X-Env': 'prod' },
    };
    const submitted = carryOverConfigSecrets(
      {
        ...stored,
        url: 'https://acme.test/hook-v2',
        // Authorization came back blank (redacted, untouched); X-Env retyped;
        // a third header added; nothing removed.
        headers: { Authorization: '', 'X-Env': 'staging', 'X-New': 'v' },
      },
      stored,
    );

    expect(submitted.headers).toEqual({
      Authorization: 'Bearer sk-live-123',
      'X-Env': 'staging',
      'X-New': 'v',
    });
    expect(submitted.url).toBe('https://acme.test/hook-v2');
  });

  it('lets a removed header stay removed', () => {
    const stored = {
      type: 'webhook',
      url: 'https://acme.test/hook',
      mode: 'message',
      headers: { Authorization: 'Bearer sk-live-123' },
    };
    const submitted = carryOverConfigSecrets(
      { ...stored, headers: {} },
      stored,
    );
    expect(submitted.headers).toEqual({});
  });

  it('does not encrypt redact-only secrets', () => {
    // The notification senders read these raw; encrypting without decrypting at
    // use would break delivery.
    const slack = encryptConfigSecrets({
      type: 'slack',
      access_token: 'xoxb-super-secret',
      incoming_webhook: { url: 'https://hooks.slack.com/x' },
    });
    expect(slack.access_token).toBe('xoxb-super-secret');
    expect(slack.incoming_webhook.url).toBe('https://hooks.slack.com/x');
  });

  it('only flags a replayed ciphertext on encrypted fields', () => {
    // A redact-only value is stored in plaintext, so a header that happens to
    // start with "enc:" is just a string, not a replay.
    expect(
      findEncryptedSecretField({
        type: 'webhook',
        url: 'https://acme.test/hook',
        mode: 'message',
        headers: { Authorization: 'enc:not-really' },
      }),
    ).toBeUndefined();
  });

  it('detects a replayed ciphertext on the input path', () => {
    // A client is never given a ciphertext, so one arriving is an attempt to
    // replay a secret lifted from another integration.
    expect(findEncryptedSecretField(gcs('enc:abc'))).toBe('serviceAccountKey');
    expect(findEncryptedSecretField(s3AccessKey('enc:abc'))).toBe(
      'secretAccessKey',
    );
    expect(findEncryptedSecretField(gcs('plaintext'))).toBeUndefined();
  });
});
