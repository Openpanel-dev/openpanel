import { DateTime } from '@openpanel/common';
import {
  ch,
  clickhouseEventToExportEvent,
  convertClickhouseDateToJs,
  createBatch,
  createManifest,
  db,
  generateBatchPath,
  type IClickhouseEvent,
  MANIFEST_CONTENT_TYPE,
  MANIFEST_FILENAME,
  serializeManifest,
  TABLE_NAMES,
} from '@openpanel/db';
import {
  createGCSAdapter,
  createS3Adapter,
  type IObjectStoreAdapter,
} from '@openpanel/integrations/src/object-store';
import { createLogger } from '@openpanel/logger';
import type { CronQueuePayload } from '@openpanel/queue';
import type {
  IGCSExportConfig,
  IIntegrationConfig,
  IS3ExportConfig,
} from '@openpanel/validation';
import type { Job } from 'bullmq';

const logger = createLogger({ name: 'flush-exports' });

// Safety lag: never export events whose inserted_at is within this window of
// now(), so an in-flight CH insert batch (or replica lag) can't be half-read at
// the boundary. Evaluated server-side via CH now64() to avoid worker/CH clock skew.
const LAG_SECONDS = Number.parseInt(process.env.EXPORT_LAG_SECONDS || '60', 10);
// Max rows per object/batch and max batches drained per (project, integration)
// per run. A backlog drains over subsequent ticks rather than in one giant pass.
const BATCH_SIZE = Number.parseInt(process.env.EXPORT_BATCH_SIZE || '50000', 10);
const MAX_BATCHES_PER_RUN = Number.parseInt(
  process.env.EXPORT_MAX_BATCHES_PER_RUN || '20',
  10
);
const CONCURRENCY = Number.parseInt(process.env.EXPORT_CONCURRENCY || '4', 10);

// Sentinel cursor id for the first window of a (project, integration). The
// events `id` column is a UUID, so the tie-breaker must compare as UUID — an
// empty string fails to parse. The id tie-breaker is load-bearing: an import
// stamps the same inserted_at across its whole batch, so a timestamp-only cursor
// would skip all but one row.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

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

function isExportConfig(config: IIntegrationConfig): config is ExportConfig {
  return config.type === 's3_export' || config.type === 'gcs_export';
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
export async function flushExportsJob(_job: Job<CronQueuePayload>) {
  const integrations = await db.integration.findMany();
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

    const projects = await db.project.findMany({
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

  await runWithConcurrency(items, CONCURRENCY, (item) =>
    processExport(item.projectId, item.integrationId, item.config).catch(
      (error) => {
        logger.error(
          {
            err: error,
            projectId: item.projectId,
            integrationId: item.integrationId,
          },
          'Export failed for project'
        );
      }
    )
  );
}

async function processExport(
  projectId: string,
  integrationId: string,
  config: ExportConfig
): Promise<void> {
  let cursor = await loadCursor(projectId, integrationId);
  const adapter: IObjectStoreAdapter =
    config.type === 's3_export'
      ? createS3Adapter(config)
      : createGCSAdapter(config);
  const prefix = config.prefix || 'openpanel-exports';
  const format = config.format || 'jsonl_gzip';

  for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
    const rows = await queryWindow(projectId, cursor);
    if (rows.length === 0) {
      break;
    }

    const events = rows.map(clickhouseEventToExportEvent);
    const batch = await createBatch(projectId, integrationId, events, format);
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
    const last = rows[rows.length - 1]!;
    cursor = { insertedAt: last.inserted_at!, eventId: last.id };
    await saveCursor(projectId, integrationId, cursor);

    logger.info(
      {
        projectId,
        integrationId,
        batchId: batch.info.batchId,
        recordCount: batch.info.recordCount,
        format,
      },
      'Export batch uploaded'
    );

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }
}

async function queryWindow(
  projectId: string,
  cursor: Cursor
): Promise<IClickhouseEvent[]> {
  const result = await ch.query({
    query: `
      SELECT ${EXPORT_COLUMNS}
      FROM ${TABLE_NAMES.events}
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
      lag: LAG_SECONDS,
      wTs: cursor.insertedAt,
      wId: cursor.eventId || NIL_UUID,
      limit: BATCH_SIZE,
    },
    format: 'JSONEachRow',
  });

  return (await result.json()) as IClickhouseEvent[];
}

async function loadCursor(
  projectId: string,
  integrationId: string
): Promise<Cursor> {
  const existing = await db.exportWatermark.findUnique({
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
  await db.exportWatermark.create({
    data: { projectId, integrationId, lastInsertedAt: now, lastEventId: NIL_UUID },
  });
  return { insertedAt: formatCh(now), eventId: NIL_UUID };
}

async function saveCursor(
  projectId: string,
  integrationId: string,
  cursor: Cursor
): Promise<void> {
  await db.exportWatermark.update({
    where: { projectId_integrationId: { projectId, integrationId } },
    data: {
      lastInsertedAt: convertClickhouseDateToJs(cursor.insertedAt),
      lastEventId: cursor.eventId,
    },
  });
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
