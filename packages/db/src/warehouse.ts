import { BigQuery } from '@google-cloud/bigquery';
import { createLogger } from '@openpanel/logger';
import {
  type IBigQueryWarehouseConfig,
  zWarehouseConfig,
} from '@openpanel/validation';
import { decrypt } from './encryption';
import { db } from './prisma-client';

const logger = createLogger({ name: 'db:warehouse' });

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

export function mapBigQueryError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/PERMISSION_DENIED|ACCESS_DENIED|403/.test(msg))
    return 'Service account lacks BigQuery permission. Grant roles/bigquery.user on the GCP project.';
  if (/NOT_FOUND|404/.test(msg))
    return 'GCP project not found. Verify the project ID in your service account JSON.';
  if (/UNAUTHENTICATED|401/.test(msg))
    return 'Credentials invalid or revoked. Generate a new service account key.';
  if (/timed out/.test(msg))
    return 'Google BigQuery API did not respond in time. Try again.';
  if (/ECONNREFUSED|ETIMEDOUT|fetch failed/.test(msg))
    return 'Could not reach Google BigQuery API. Check network connectivity.';
  return `BigQuery connection failed: ${msg}`;
}

// Builds a BigQuery client from a raw (already validated) config.
// Used for test-before-save in connect / updateConnection before any DB write.
export function buildBigQueryClient(config: IBigQueryWarehouseConfig): BigQuery {
  return new BigQuery({
    projectId: config.gcpProjectId,
    credentials: JSON.parse(config.serviceAccountJson) as object,
    ...(config.gcpRegion ? { location: config.gcpRegion } : {}),
  });
}

// Loads a connection from DB, verifies project ownership, decrypts config, returns BigQuery client.
// Used by tRPC procedures (Phase 2/3) and the sync worker (Phase 4).
export async function getWarehouseClient(
  connectionId: string,
  projectId: string,
): Promise<BigQuery> {
  const conn = await db.warehouseConnection.findUnique({
    where: { id: connectionId },
    select: { projectId: true, configEncrypted: true },
  });
  if (!conn || conn.projectId !== projectId) {
    throw new Error('Warehouse connection not found');
  }
  const config = zWarehouseConfig.parse(
    JSON.parse(decrypt(conn.configEncrypted)),
  );
  // No cast needed — zWarehouseConfig is a discriminated union; TypeScript will error here
  // when a new provider arm is added, forcing a proper switch/case dispatch.
  return buildBigQueryClient(config);
}

export async function listWarehouseDatasets(
  connectionId: string,
  projectId: string,
): Promise<string[]> {
  const bq = await getWarehouseClient(connectionId, projectId);
  const [datasets] = await withTimeout(bq.getDatasets(), 10_000, 'listDatasets');
  return (datasets ?? []).map((d) => d.id ?? '').filter(Boolean);
}

export async function listWarehouseTables(
  connectionId: string,
  projectId: string,
  dataset: string,
): Promise<string[]> {
  const bq = await getWarehouseClient(connectionId, projectId);
  const [tables] = await withTimeout(
    bq.dataset(dataset).getTables(),
    10_000,
    'listTables',
  );
  return (tables ?? []).map((t) => t.id ?? '').filter(Boolean);
}

export interface WarehouseTableField {
  name: string;
  type: string;
  mode: string;
}

export async function getWarehouseTableSchema(
  connectionId: string,
  projectId: string,
  dataset: string,
  tableName: string,
): Promise<WarehouseTableField[]> {
  const bq = await getWarehouseClient(connectionId, projectId);
  const [metadata] = await withTimeout(
    bq.dataset(dataset).table(tableName).getMetadata(),
    10_000,
    'getTableSchema',
  );
  const fields = (
    (metadata as { schema?: { fields?: unknown[] } })?.schema?.fields ?? []
  ) as Array<{ name?: string; type?: string; mode?: string }>;
  return fields.map((f) => ({
    name: f.name ?? '',
    type: f.type ?? 'STRING',
    mode: f.mode ?? 'NULLABLE',
  }));
}

logger.info('Warehouse data service loaded');
