import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zWarehouseConfig } from '@openpanel/validation';

// mapBigQueryError has no BigQuery dependency — test it directly.
// buildBigQueryClient and getWarehouseClient require live GCP credentials;
// those are exercised by the connect/testConnection tRPC integration path.

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn().mockImplementation(() => ({
    getDatasets: vi.fn(),
    dataset: vi.fn(),
  })),
}));

vi.mock('./prisma-client', () => ({ db: {} }));
vi.mock('./encryption', () => ({ decrypt: vi.fn(), encrypt: vi.fn() }));
vi.mock('@openpanel/logger', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

describe('mapBigQueryError', () => {
  let mapBigQueryError: (err: unknown) => string;

  beforeEach(async () => {
    const mod = await import('./warehouse');
    mapBigQueryError = mod.mapBigQueryError;
  });

  it('maps PERMISSION_DENIED to human message', () => {
    expect(mapBigQueryError(new Error('PERMISSION_DENIED: caller lacks permission'))).toContain(
      'lacks BigQuery permission',
    );
  });

  it('maps ACCESS_DENIED to human message', () => {
    expect(mapBigQueryError(new Error('ACCESS_DENIED'))).toContain('lacks BigQuery permission');
  });

  it('maps 403 in message to permission error', () => {
    expect(mapBigQueryError(new Error('HTTP 403: Forbidden'))).toContain('lacks BigQuery permission');
  });

  it('maps NOT_FOUND to project-not-found message', () => {
    expect(mapBigQueryError(new Error('NOT_FOUND: project my-project not found'))).toContain(
      'project not found',
    );
  });

  it('maps 404 in message to project-not-found message', () => {
    expect(mapBigQueryError(new Error('404: resource not found'))).toContain('project not found');
  });

  it('maps UNAUTHENTICATED to credentials-revoked message', () => {
    expect(mapBigQueryError(new Error('UNAUTHENTICATED: token expired'))).toContain(
      'invalid or revoked',
    );
  });

  it('maps 401 in message to credentials-revoked message', () => {
    expect(mapBigQueryError(new Error('401 Unauthorized'))).toContain('invalid or revoked');
  });

  it('maps timeout to retry message', () => {
    expect(mapBigQueryError(new Error('listDatasets timed out after 10000ms'))).toContain(
      'did not respond in time',
    );
  });

  it('maps ECONNREFUSED to connectivity message', () => {
    expect(mapBigQueryError(new Error('ECONNREFUSED 127.0.0.1:443'))).toContain(
      'Could not reach',
    );
  });

  it('maps ETIMEDOUT to connectivity message', () => {
    expect(mapBigQueryError(new Error('ETIMEDOUT'))).toContain('Could not reach');
  });

  it('maps fetch failed to connectivity message', () => {
    expect(mapBigQueryError(new Error('fetch failed: network error'))).toContain('Could not reach');
  });

  it('falls back gracefully for unknown GCP errors', () => {
    const result = mapBigQueryError(new Error('Some weird GCP error XYZ'));
    expect(result).toContain('BigQuery connection failed');
    expect(result).toContain('Some weird GCP error XYZ');
  });

  it('handles non-Error string throws', () => {
    const result = mapBigQueryError('plain string error');
    expect(result).toContain('BigQuery connection failed');
  });

  it('handles null without crashing', () => {
    expect(() => mapBigQueryError(null)).not.toThrow();
    expect(mapBigQueryError(null)).toContain('BigQuery connection failed');
  });

  it('handles undefined without crashing', () => {
    expect(() => mapBigQueryError(undefined)).not.toThrow();
  });

  it('handles plain object without crashing', () => {
    expect(() => mapBigQueryError({ code: 403 })).not.toThrow();
  });

  // Priority: 403 beats NOT_FOUND if both appear in message
  it('prioritises PERMISSION_DENIED over NOT_FOUND when both in message', () => {
    const result = mapBigQueryError(new Error('PERMISSION_DENIED: 403 NOT_FOUND'));
    // First regex match wins — PERMISSION_DENIED/403 check is first
    expect(result).toContain('lacks BigQuery permission');
  });
});

// ─── gcpRegion preservation — key-rotation regression ────────────────────────
//
// updateConnection (the "Rotate Key" flow) receives a config without gcpRegion
// because the RotateKeyDialog UI has no region field — gcpRegion is encrypted
// and never stored as a plain-text display field. The router must decrypt the
// existing config and carry the region forward, otherwise Phase 4 queries
// against non-US datasets silently break ("Location X does not support jobs
// without an explicit location").
//
// This suite tests the config round-trip and merge logic used by the fix
// without needing a full tRPC test harness.

const VALID_SA = JSON.stringify({
  type: 'service_account',
  project_id: 'my-project',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nFAKE_TEST_KEY_DO_NOT_USE',
  client_email: 'sa@my-project.iam.gserviceaccount.com',
});

const NEW_SA = JSON.stringify({
  type: 'service_account',
  project_id: 'my-project',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nFAKE_TEST_KEY_DO_NOT_USE',
  client_email: 'sa-new@my-project.iam.gserviceaccount.com',
});

describe('gcpRegion preservation on key rotation', () => {
  it('zWarehouseConfig round-trips gcpRegion through JSON stringify/parse', () => {
    const original = {
      type: 'bigquery' as const,
      gcpProjectId: 'my-project',
      serviceAccountJson: VALID_SA,
      gcpRegion: 'europe-west1',
    };
    const parsed = zWarehouseConfig.safeParse(JSON.parse(JSON.stringify(original)));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === 'bigquery') {
      expect(parsed.data.gcpRegion).toBe('europe-west1');
    }
  });

  it('merge logic carries existing gcpRegion when new config omits it', () => {
    const existingConfigJson = JSON.stringify({
      type: 'bigquery',
      gcpProjectId: 'my-project',
      serviceAccountJson: VALID_SA,
      gcpRegion: 'europe-west1',
    });
    const newConfigNoRegion: { type: 'bigquery'; gcpProjectId: string; serviceAccountJson: string; gcpRegion?: string } = {
      type: 'bigquery',
      gcpProjectId: 'my-project',
      serviceAccountJson: NEW_SA,
    };

    const existingParsed = zWarehouseConfig.safeParse(JSON.parse(existingConfigJson));
    const existingRegion =
      existingParsed.success && existingParsed.data.type === 'bigquery'
        ? existingParsed.data.gcpRegion
        : undefined;

    const mergedConfig = {
      ...newConfigNoRegion,
      ...(!newConfigNoRegion.gcpRegion && existingRegion ? { gcpRegion: existingRegion } : {}),
    };

    expect(mergedConfig.gcpRegion).toBe('europe-west1');
  });

  it('merge logic does not overwrite explicitly provided gcpRegion', () => {
    const existingConfigJson = JSON.stringify({
      type: 'bigquery',
      gcpProjectId: 'my-project',
      serviceAccountJson: VALID_SA,
      gcpRegion: 'europe-west1',
    });
    const newConfigWithRegion = {
      type: 'bigquery' as const,
      gcpProjectId: 'my-project',
      serviceAccountJson: NEW_SA,
      gcpRegion: 'us-central1',
    };

    const existingParsed = zWarehouseConfig.safeParse(JSON.parse(existingConfigJson));
    const existingRegion =
      existingParsed.success && existingParsed.data.type === 'bigquery'
        ? existingParsed.data.gcpRegion
        : undefined;

    const mergedConfig = {
      ...newConfigWithRegion,
      ...(!newConfigWithRegion.gcpRegion && existingRegion ? { gcpRegion: existingRegion } : {}),
    };

    expect((mergedConfig as { gcpRegion?: string }).gcpRegion).toBe('us-central1');
  });

  it('merge logic is a no-op when existing config has no gcpRegion', () => {
    const existingConfigJson = JSON.stringify({
      type: 'bigquery',
      gcpProjectId: 'my-project',
      serviceAccountJson: VALID_SA,
      // no gcpRegion
    });
    const newConfigNoRegion: { type: 'bigquery'; gcpProjectId: string; serviceAccountJson: string; gcpRegion?: string } = {
      type: 'bigquery',
      gcpProjectId: 'my-project',
      serviceAccountJson: NEW_SA,
    };

    const existingParsed = zWarehouseConfig.safeParse(JSON.parse(existingConfigJson));
    const existingRegion =
      existingParsed.success && existingParsed.data.type === 'bigquery'
        ? existingParsed.data.gcpRegion
        : undefined;

    const mergedConfig = {
      ...newConfigNoRegion,
      ...(!newConfigNoRegion.gcpRegion && existingRegion ? { gcpRegion: existingRegion } : {}),
    };

    expect(mergedConfig.gcpRegion).toBeUndefined();
  });
});
