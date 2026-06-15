import { describe, expect, it } from 'vitest';
import {
  zBigQueryColumnMappingEvents,
  zBigQuerySyncConfig,
  zBigQueryWarehouseConfig,
  zServiceAccountJson,
  zWarehouseConfig,
  zWarehouseConnectionCreate,
} from './index';

const VALID_SA = JSON.stringify({
  type: 'service_account',
  project_id: 'my-gcp-project',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIIE',
  client_email: 'sa@my-gcp-project.iam.gserviceaccount.com',
});

const VALID_BQ_CONFIG = {
  type: 'bigquery' as const,
  gcpProjectId: 'my-gcp-project',
  serviceAccountJson: VALID_SA,
};

// Minimal valid sync — onetime mode skips schedule + insertTime requirements
const VALID_SYNC_BASE = {
  displayName: 'Test Sync',
  dataset: 'analytics',
  tableName: 'events_raw',
  syncMode: 'onetime' as const,
  columnMapping: { mappingType: 'events' as const, timestamp: 'created_at' },
};

// Minimal valid append sync (requires schedule + insertTime)
const VALID_APPEND_SYNC = {
  displayName: 'Append Sync',
  dataset: 'analytics',
  tableName: 'events_raw',
  syncMode: 'append' as const,
  schedule: 'daily' as const,
  columnMapping: {
    mappingType: 'events' as const,
    timestamp: 'created_at',
    insertTime: 'inserted_at',
  },
};

// ─── zServiceAccountJson ─────────────────────────────────────────────────────

describe('zServiceAccountJson', () => {
  it('accepts valid SA JSON', () => {
    expect(zServiceAccountJson.safeParse(VALID_SA).success).toBe(true);
  });

  it('rejects authorized_user credential type', () => {
    const r = zServiceAccountJson.safeParse(
      JSON.stringify({ type: 'authorized_user', client_id: 'x', client_secret: 'y' }),
    );
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('service_account');
  });

  it('rejects JSON missing private_key', () => {
    const r = zServiceAccountJson.safeParse(
      JSON.stringify({ type: 'service_account', project_id: 'p', client_email: 'e@e.com' }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects JSON missing client_email', () => {
    const r = zServiceAccountJson.safeParse(
      JSON.stringify({ type: 'service_account', project_id: 'p', private_key: 'k' }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects JSON missing project_id', () => {
    const r = zServiceAccountJson.safeParse(
      JSON.stringify({ type: 'service_account', private_key: 'k', client_email: 'e@e.com' }),
    );
    expect(r.success).toBe(false);
  });

  it('rejects plain non-JSON string', () => {
    expect(zServiceAccountJson.safeParse('not-json').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(zServiceAccountJson.safeParse('').success).toBe(false);
  });

  it('rejects SA JSON > 16 KB', () => {
    const big = JSON.stringify({
      type: 'service_account',
      project_id: 'p',
      private_key: 'x'.repeat(17_000),
      client_email: 'e@e.com',
    });
    expect(zServiceAccountJson.safeParse(big).success).toBe(false);
  });
});

// ─── zBigQueryWarehouseConfig ─────────────────────────────────────────────────

describe('zBigQueryWarehouseConfig', () => {
  it('accepts valid config without region', () => {
    expect(zBigQueryWarehouseConfig.safeParse(VALID_BQ_CONFIG).success).toBe(true);
  });

  it('accepts valid config with US region', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpRegion: 'US' }).success).toBe(true);
  });

  it('accepts valid config with europe-west1 region', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpRegion: 'europe-west1' }).success).toBe(true);
  });

  it('accepts valid config with us-central1 region', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpRegion: 'us-central1' }).success).toBe(true);
  });

  it('rejects uppercase in GCP project ID', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpProjectId: 'My-Project' }).success).toBe(false);
  });

  it('rejects GCP project ID shorter than 6 chars', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpProjectId: 'ab' }).success).toBe(false);
  });

  it('rejects GCP project ID longer than 30 chars', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpProjectId: `${'ab-'.repeat(11)}` }).success).toBe(false);
  });

  it('rejects GCP project ID starting with digit', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpProjectId: '1my-project' }).success).toBe(false);
  });

  it('rejects region with embedded space', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpRegion: 'us central1' }).success).toBe(false);
  });

  it('rejects region with invalid format', () => {
    expect(zBigQueryWarehouseConfig.safeParse({ ...VALID_BQ_CONFIG, gcpRegion: '../etc/passwd' }).success).toBe(false);
  });
});

// ─── zWarehouseConfig discriminated union ────────────────────────────────────

describe('zWarehouseConfig', () => {
  it('accepts bigquery type', () => {
    expect(zWarehouseConfig.safeParse(VALID_BQ_CONFIG).success).toBe(true);
  });

  it('rejects unknown provider type', () => {
    expect(zWarehouseConfig.safeParse({ type: 'mysql', host: 'localhost' }).success).toBe(false);
  });

  it('rejects config with no type field', () => {
    expect(zWarehouseConfig.safeParse({ gcpProjectId: 'x', serviceAccountJson: VALID_SA }).success).toBe(false);
  });
});

// ─── zWarehouseConnectionCreate name validation ───────────────────────────────

describe('zWarehouseConnectionCreate — name validation', () => {
  const make = (name: string) =>
    zWarehouseConnectionCreate.safeParse({ name, config: VALID_BQ_CONFIG });

  it('accepts alphanumeric name', () => {
    expect(make('MyBigQuery').success).toBe(true);
  });

  it('accepts name with hyphens and underscores and spaces', () => {
    expect(make('prod_bq-conn 1').success).toBe(true);
  });

  it('rejects whitespace-only name', () => {
    expect(make('   ').success).toBe(false);
  });

  it('rejects empty string name', () => {
    expect(make('').success).toBe(false);
  });

  it('rejects name longer than 50 chars', () => {
    expect(make('a'.repeat(51)).success).toBe(false);
  });

  it('rejects name with semicolon (SQL injection)', () => {
    expect(make("conn'; DROP TABLE--").success).toBe(false);
  });

  it('rejects name with angle brackets (XSS)', () => {
    expect(make('<script>alert(1)</script>').success).toBe(false);
  });

  it('rejects name with single quote', () => {
    expect(make("O'Reilly").success).toBe(false);
  });

  it('rejects name with newline', () => {
    expect(make('conn\ninjection').success).toBe(false);
  });
});

// ─── zBigQueryColumnMappingEvents ────────────────────────────────────────────

describe('zBigQueryColumnMappingEvents', () => {
  it('accepts minimal mapping (only mappingType)', () => {
    expect(zBigQueryColumnMappingEvents.safeParse({ mappingType: 'events' }).success).toBe(true);
  });

  it('accepts full column mapping with optional fields', () => {
    expect(
      zBigQueryColumnMappingEvents.safeParse({
        mappingType: 'events',
        timestamp: 'created_at',
        profileId: 'user_id',
        insertTime: 'inserted_at',
        deviceId: 'device',
        eventId: 'id',
        revenue: 'amount',
        eventName: 'event_type',
        jsonProperties: 'raw_props',
      }).success,
    ).toBe(true);
  });

  it('accepts dot-notation column paths', () => {
    expect(
      zBigQueryColumnMappingEvents.safeParse({
        mappingType: 'events',
        timestamp: 'metadata.created_at',
        profileId: 'user.id',
      }).success,
    ).toBe(true);
  });

  it('rejects column name with spaces', () => {
    expect(
      zBigQueryColumnMappingEvents.safeParse({ mappingType: 'events', timestamp: 'created at' }).success,
    ).toBe(false);
  });

  it('rejects column name starting with digit', () => {
    expect(
      zBigQueryColumnMappingEvents.safeParse({ mappingType: 'events', timestamp: '1col' }).success,
    ).toBe(false);
  });

  it('rejects column name with SQL injection chars', () => {
    expect(
      zBigQueryColumnMappingEvents.safeParse({ mappingType: 'events', timestamp: "col'; DROP" }).success,
    ).toBe(false);
  });
});

// ─── zBigQuerySyncConfig ─────────────────────────────────────────────────────

describe('zBigQuerySyncConfig', () => {
  it('accepts valid onetime sync (no schedule required)', () => {
    expect(zBigQuerySyncConfig.safeParse(VALID_SYNC_BASE).success).toBe(true);
  });

  it('accepts valid append sync with insertTime', () => {
    expect(zBigQuerySyncConfig.safeParse(VALID_APPEND_SYNC).success).toBe(true);
  });

  it('accepts full-recurring sync (no insertTime needed)', () => {
    const r = zBigQuerySyncConfig.safeParse({
      displayName: 'Full Sync',
      dataset: 'analytics',
      tableName: 'users',
      syncMode: 'full',
      schedule: 'weekly',
      columnMapping: { mappingType: 'events', timestamp: 'ts' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts partitionFilter with comparison', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      partitionFilter: '_PARTITIONDATE >= "2024-01-01"',
    });
    expect(r.success).toBe(true);
  });

  it('rejects partitionFilter containing semicolon', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      partitionFilter: 'x = 1; DROP TABLE events',
    });
    expect(r.success).toBe(false);
  });

  it('rejects partitionFilter containing SQL comment (--)', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      partitionFilter: 'x = 1 -- bypass',
    });
    expect(r.success).toBe(false);
  });

  it('rejects partitionFilter containing block comment (/* */)', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      partitionFilter: 'x = 1 /* injected */',
    });
    expect(r.success).toBe(false);
  });

  it('rejects append/events sync without insertTime', () => {
    const r = zBigQuerySyncConfig.safeParse({
      displayName: 'Bad Append',
      dataset: 'analytics',
      tableName: 'events_raw',
      syncMode: 'append',
      schedule: 'daily',
      columnMapping: { mappingType: 'events', timestamp: 'created_at' },
      // insertTime missing
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('insertTime');
  });

  it('rejects non-onetime sync without schedule', () => {
    const r = zBigQuerySyncConfig.safeParse({
      displayName: 'No Schedule',
      dataset: 'analytics',
      tableName: 'events_raw',
      syncMode: 'full',
      // schedule missing
      columnMapping: { mappingType: 'events', timestamp: 'ts' },
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('schedule');
  });

  it('rejects dataset name with hyphens (BigQuery restriction)', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      dataset: 'my-dataset',
    });
    expect(r.success).toBe(false);
  });

  it('rejects tableName with spaces', () => {
    const r = zBigQuerySyncConfig.safeParse({
      ...VALID_SYNC_BASE,
      tableName: 'my events',
    });
    expect(r.success).toBe(false);
  });
});
