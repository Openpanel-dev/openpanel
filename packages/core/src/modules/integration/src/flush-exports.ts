// Ported from apps/worker/src/jobs/cron.flush-exports.ts (the wave that deletes
// apps/worker). ADR-005's acceptance note gives `flushExports` to the
// integration module. Behaviour is V1's, verbatim; Prisma, the ClickHouse
// client and the object-store adapter factory arrive as injected deps so the
// orchestration is testable without `mock.module` (same idiom as
// modules/session/src/runtime.ts).
//
// The window query is a MOVE, not an ADR-013 conversion: it already binds every
// value through ClickHouse's own `{name:Type}` params, and converting it to the
// `sql` tag would change the emitted statement. Kept byte-identical.

import { DateTime } from '@openpanel/shared';
import { isProviderError } from '../../../clients/provider-error';
import type { CoreConfig } from '../../../config';
import type { Logger } from '../../../logger';
import type { IClickhouseEvent } from '../../event/event.service';
import {
  type IGCSExportConfig,
  type IIntegrationConfig,
  type IS3ExportConfig,
  isKind,
} from '../integration.constants';
import {
  clickhouseEventToExportEvent,
  createBatch,
  createManifest,
  generateBatchPath,
  MANIFEST_CONTENT_TYPE,
  MANIFEST_FILENAME,
  serializeManifest,
} from './export';
import type { IObjectStoreAdapter } from './object-store';

// Safety lag: never export events whose inserted_at is within this window of
// now(), so an in-flight CH insert batch (or replica lag) can't be half-read at
// the boundary. Evaluated server-side via CH now64() to avoid worker/CH clock skew.
const DEFAULT_LAG_SECONDS = 60;
// Max rows per object/batch and max batches drained per (project, integration)
// per run. A backlog drains over subsequent ticks rather than in one giant pass.
const DEFAULT_BATCH_SIZE = 50_000;
const DEFAULT_MAX_BATCHES_PER_RUN = 20;
const DEFAULT_CONCURRENCY = 4;

// Sentinel cursor id for the first window of a (project, integration). The
// events `id` column is a UUID, so the tie-breaker must compare as UUID — an
// empty string fails to parse. The id tie-breaker is load-bearing: an import
// stamps the same inserted_at across its whole batch, so a timestamp-only cursor
// would skip all but one row.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

// Local literal, not @openpanel/db's TABLE_NAMES — same choice cohort.service.ts
// made, and for the same reason: importing that module constructs a ClickHouse
// client at import time.
const EVENTS_TABLE = 'events';

const EXPORT_COLUMNS = `
  id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
  session_id, path, origin, referrer, referrer_name, referrer_type,
  duration, properties, created_at, country, city, region,
  longitude, latitude, os, os_version, browser, browser_version,
  device, brand, model, imported_at, inserted_at, revenue
`;

type ExportConfig = IS3ExportConfig | IGCSExportConfig;

interface Cursor {
  // CH datetime string 'yyyy-MM-dd HH:mm:ss.SSS' + last event id, a composite
  // cursor so rows sharing an inserted_at aren't skipped or duplicated.
  insertedAt: string;
  eventId: string;
}

/** The ClickHouse surface this job touches — nothing wider. */
export interface ExportClickhouse {
  query(params: {
    query: string;
    query_params: Record<string, unknown>;
    format: 'JSONEachRow';
  }): Promise<{ json(): Promise<unknown> }>;
}

export interface ExportIntegrationRow {
  id: string;
  organizationId: string;
  projectId: string | null;
  config: IIntegrationConfig;
}

export interface ExportWatermarkRow {
  lastInsertedAt: Date;
  lastEventId: string;
}

/** The Prisma surface this job touches — nothing wider. */
export interface ExportDb {
  integration: { findMany(args?: unknown): Promise<ExportIntegrationRow[]> };
  project: { findMany(args: unknown): Promise<{ id: string }[]> };
  exportWatermark: {
    findUnique(args: unknown): Promise<ExportWatermarkRow | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
}

export interface FlushExportsDeps {
  db: ExportDb;
  ch: ExportClickhouse;
  logger: Logger;
  /** EXPORT_LAG_SECONDS / _BATCH_SIZE / _MAX_BATCHES_PER_RUN / _CONCURRENCY. */
  config: CoreConfig;
  /** Resolves the object-store adapter for an export config, or undefined. */
  createAdapter(config: ExportConfig): IObjectStoreAdapter | undefined;
}

function isExportConfig(config: IIntegrationConfig): config is ExportConfig {
  // Capability comes from the integration registry, not a hardcoded type list.
  return isKind(config, 'export');
}

const formatCh = (date: Date): string =>
  DateTime.fromJSDate(date).setZone('UTC').toFormat('yyyy-MM-dd HH:mm:ss.SSS');

/**
 * Drain new ClickHouse events into each configured object-store export.
 *
 * The Redis buffer + per-event hook are gone: ClickHouse is the single source of
 * truth, so this job windows the events table by `inserted_at` and uploads
 * batched files. Export never touches the ingestion path.
 */
export async function runFlushExportsCron(
  deps: FlushExportsDeps
): Promise<void> {
  const integrations = await deps.db.integration.findMany();
  const exportIntegrations = integrations.filter((i) =>
    isExportConfig(i.config)
  );

  if (exportIntegrations.length === 0) {
    return;
  }

  // Project-scoped integrations export exactly their one project. Legacy
  // org-wide integrations (projectId == null) still fan out across every active
  // project in the org. Either way each (project, integration) pair gets its own
  // watermark + object path.
  const items: Array<{
    projectId: string;
    integrationId: string;
    config: ExportConfig;
  }> = [];
  for (const integration of exportIntegrations) {
    const config = integration.config as ExportConfig;

    if (integration.projectId) {
      items.push({
        projectId: integration.projectId,
        integrationId: integration.id,
        config,
      });
      continue;
    }

    const projects = await deps.db.project.findMany({
      where: { organizationId: integration.organizationId, deleteAt: null },
      select: { id: true },
    });
    for (const project of projects) {
      items.push({
        projectId: project.id,
        integrationId: integration.id,
        config,
      });
    }
  }

  // The adapters classify, this reads the flag. A permanent refusal (bad
  // bucket, revoked key) is logged and left alone — the next tick would refuse
  // identically. A retryable one fails the job at the end, so a provider outage
  // is visible rather than a green run that exported nothing.
  let retryableFailures = 0;
  await runWithConcurrency(
    items,
    deps.config.objectStoreExport.concurrency ?? DEFAULT_CONCURRENCY,
    (item) =>
      processExport(
        item.projectId,
        item.integrationId,
        item.config,
        deps
      ).catch((error) => {
        const retryable = !isProviderError(error) || error.retryable;
        if (retryable) {
          retryableFailures++;
        }
        deps.logger.error(
          {
            err: error,
            projectId: item.projectId,
            integrationId: item.integrationId,
            retryable,
          },
          'Export failed for project'
        );
      })
  );

  if (retryableFailures > 0) {
    throw new Error(
      `${retryableFailures} of ${items.length} exports failed with a retryable provider error`
    );
  }
}

async function processExport(
  projectId: string,
  integrationId: string,
  config: ExportConfig,
  deps: FlushExportsDeps
): Promise<void> {
  let cursor = await loadCursor(projectId, integrationId, deps);
  const adapter = deps.createAdapter(config);
  if (!adapter) {
    throw new Error(`Integration ${config.type} has no export adapter`);
  }
  const prefix = config.prefix || 'openpanel-exports';
  const format = config.format || 'jsonl_gzip';

  const maxBatches =
    deps.config.objectStoreExport.maxBatchesPerRun ??
    DEFAULT_MAX_BATCHES_PER_RUN;
  const batchSize =
    deps.config.objectStoreExport.batchSize ?? DEFAULT_BATCH_SIZE;
  for (let i = 0; i < maxBatches; i++) {
    const rows = await queryWindow(projectId, cursor, deps);
    if (rows.length === 0) {
      break;
    }

    const events = rows.map(clickhouseEventToExportEvent);
    const batch = await createBatch(
      deps.logger,
      projectId,
      integrationId,
      events,
      format
    );
    const basePath = generateBatchPath(
      prefix,
      projectId,
      integrationId,
      batch.info.batchId,
      new Date(batch.info.minEventTime)
    );

    // Upload data files first, then the manifest last as the commit marker.
    for (const file of batch.files) {
      await adapter.upload({
        bucket: config.bucket,
        key: `${basePath}/${file.filename}`,
        content: file.content,
        contentType: file.contentType,
      });
    }
    const manifest = createManifest(
      batch.info,
      batch.files.map((f) => f.filename)
    );
    await adapter.upload({
      bucket: config.bucket,
      key: `${basePath}/${MANIFEST_FILENAME}`,
      content: serializeManifest(manifest),
      contentType: MANIFEST_CONTENT_TYPE,
    });

    // Advance the watermark only after a successful upload. A crash mid-run
    // re-exports the un-acked batch next tick (at-least-once); the manifest is
    // the consumer's signal that a batch is complete.
    const last = rows.at(-1)!;
    cursor = { insertedAt: last.inserted_at!, eventId: last.id };
    await saveCursor(projectId, integrationId, cursor, deps);

    deps.logger.info(
      {
        projectId,
        integrationId,
        batchId: batch.info.batchId,
        recordCount: batch.info.recordCount,
        format,
      },
      'Export batch uploaded'
    );

    if (rows.length < batchSize) {
      break;
    }
  }
}

async function queryWindow(
  projectId: string,
  cursor: Cursor,
  deps: FlushExportsDeps
): Promise<IClickhouseEvent[]> {
  const result = await deps.ch.query({
    query: `
      SELECT ${EXPORT_COLUMNS}
      FROM ${EVENTS_TABLE}
      WHERE project_id = {projectId:String}
        AND inserted_at <= now64(3) - INTERVAL {lag:UInt32} SECOND
        AND (
          inserted_at > {wTs:DateTime64(3)}
          OR (inserted_at = {wTs:DateTime64(3)} AND id > {wId:UUID})
        )
      ORDER BY inserted_at, id
      LIMIT {limit:UInt32}
    `,
    query_params: {
      projectId,
      lag: deps.config.objectStoreExport.lagSeconds ?? DEFAULT_LAG_SECONDS,
      wTs: cursor.insertedAt,
      wId: cursor.eventId || NIL_UUID,
      limit: deps.config.objectStoreExport.batchSize ?? DEFAULT_BATCH_SIZE,
    },
    format: 'JSONEachRow',
  });

  return (await result.json()) as IClickhouseEvent[];
}

async function loadCursor(
  projectId: string,
  integrationId: string,
  deps: FlushExportsDeps
): Promise<Cursor> {
  const existing = await deps.db.exportWatermark.findUnique({
    where: { projectId_integrationId: { projectId, integrationId } },
  });
  if (existing) {
    return {
      insertedAt: formatCh(existing.lastInsertedAt),
      eventId: existing.lastEventId,
    };
  }

  // First run for this pair: start from now, so connecting an export doesn't
  // dump the project's entire history. Historical backfill is a separate,
  // explicit operation (reset the watermark).
  const now = new Date();
  await deps.db.exportWatermark.create({
    data: {
      projectId,
      integrationId,
      lastInsertedAt: now,
      lastEventId: NIL_UUID,
    },
  });
  return { insertedAt: formatCh(now), eventId: NIL_UUID };
}

async function saveCursor(
  projectId: string,
  integrationId: string,
  cursor: Cursor,
  deps: FlushExportsDeps
): Promise<void> {
  await deps.db.exportWatermark.update({
    where: { projectId_integrationId: { projectId, integrationId } },
    data: {
      lastInsertedAt: convertClickhouseDateToJs(cursor.insertedAt),
      lastEventId: cursor.eventId,
    },
  });
}

// Local copy for the reason every modules/*/src/dates.ts gives: importing
// @openpanel/db's clickhouse/client constructs a client at import time.
function convertClickhouseDateToJs(date: string): Date {
  return new Date(`${date.replace(' ', 'T')}Z`);
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, queue.length)) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) {
          break;
        }
        await fn(item);
      }
    }
  );
  await Promise.all(workers);
}
