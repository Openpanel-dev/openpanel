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
