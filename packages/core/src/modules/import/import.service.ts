// Moved from packages/db/src/services/import.service.ts (the ClickHouse
// staging/session pipeline) + apps/worker/src/jobs/import.ts (the job body
// and provider dispatch) + apps/api/src/controllers/import.controller.ts
// (the /import/events bulk-insert path) — M5-004, ADR-008's module map:
// import owns "S". packages/db/src/services/import.service.ts is deleted
// outright: nothing outside the worker job file it moves with reached it
// through @openpanel/db's barrel (same as cohort.service.ts, M5-003).
//
// db/ch access is LAZY (`load*` below), not a static top-level import — see
// gsc.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches). The provider classes are behind a dynamic `import()`
// for the same reason: they eagerly import `formatClickhouseDate` from
// @openpanel/db's clickhouse client, which constructs a real pino transport
// at import time.
//
// ClickHouse queries here still go through raw `ch`/`chQuery` calls, not the
// `sql` tag: ADR-013 converts the analytics read path one query per P7 task,
// and this module's queries haven't been converted yet.

import { createHash } from 'node:crypto';
import { toDots } from '@openpanel/common';
import type { IClickhouseEvent, IClickhouseProfile } from '@openpanel/db';
import type { Prisma } from '@openpanel/db/src/prisma-client';
import { createLogger, type ILogger } from '../../clients/logger';
import type { Logger } from '../../logger';
import type { ServiceDeps } from '../../services';
import type { IImportConfig } from './import.constants';

const BATCH_SIZE = Number.parseInt(process.env.IMPORT_BATCH_SIZE || '5000', 10);
const SESSION_BATCH_SIZE = 5000;
const PROFILE_BATCH_SIZE = 5000;
// Profiles derived inline from events (Amplitude, which has no profile export
// API) are deduped in a bounded map so memory stays flat regardless of event
// volume; the profiles table's ReplacingMergeTree(last_seen_at) collapses any
// duplicate rows that span flush boundaries to the latest activity per id.
const PROFILE_MAP_CAP = 50_000;
const RESUMABLE_STEPS = ['creating_sessions', 'moving', 'backfilling_sessions'];

let _logger: ILogger | undefined;
function getLogger(): ILogger {
  _logger ??= createLogger({ name: 'core:import' });
  return _logger;
}

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 100);
  });
}

// ---------------------------------------------------------------------------
// ClickHouse staging pipeline — moved from packages/db/src/services/
// import.service.ts.
// ---------------------------------------------------------------------------

export interface ImportStageResult {
  importId: string;
  totalEvents: number;
  insertedEvents: number;
}

/**
 * Insert a batch of events into the imports staging table
 */
export async function insertImportBatch(
  events: IClickhouseEvent[],
  importId: string
): Promise<ImportStageResult> {
  if (events.length === 0) {
    return { importId, totalEvents: 0, insertedEvents: 0 };
  }

  const { ch, TABLE_NAMES, formatClickhouseDate } = await loadChClient();
  const now = formatClickhouseDate(new Date());
  const rows = events.map((event) => ({
    ...event,
    import_id: importId,
    import_status: 'pending',
    imported_at: event.imported_at || now,
    imported_at_meta: now,
  }));

  await ch.insert({
    table: TABLE_NAMES.events_imports,
    values: rows,
    format: 'JSONEachRow',
  });

  return {
    importId,
    totalEvents: events.length,
    insertedEvents: events.length,
  };
}

/**
 * Insert a batch of profiles into the production profiles table.
 * Used by Mixpanel (and other providers) to import user profiles during an import job.
 */
export async function insertProfilesBatch(
  profiles: IClickhouseProfile[],
  projectId: string
): Promise<{ inserted: number }> {
  if (profiles.length === 0) {
    return { inserted: 0 };
  }

  const { ch, TABLE_NAMES } = await loadChClient();
  const normalized = profiles.map((p) => ({
    id: p.id,
    project_id: projectId,
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    email: p.email ?? '',
    avatar: p.avatar ?? '',
    is_external: p.is_external ?? true,
    properties: Object.fromEntries(
      Object.entries(p.properties || {}).filter(
        (kv): kv is [string, string] => kv[1] != null && kv[1] !== ''
      )
    ) as Record<string, string>,
    created_at: p.created_at,
    last_seen_at: p.last_seen_at ?? p.created_at,
  }));

  await ch.insert({
    table: TABLE_NAMES.profiles,
    values: normalized,
    format: 'JSONEachRow',
  });

  return { inserted: normalized.length };
}

/**
 * Generate gap-based session IDs for events that have none.
 * Streams events from staging (sorted by device_id, created_at), assigns a new
 * session when gap > 30 min, re-inserts with session_id, then deletes old rows.
 */
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

export async function generateGapBasedSessionIds(
  importId: string
): Promise<void> {
  const { ch, TABLE_NAMES, getReplicatedTableName } = await loadChClient();
  let currentDeviceId = '';
  let currentSessionId = '';
  let currentLastTime = 0;
  let currentCounter = -1;
  const batch: IClickhouseEvent[] = [];

  const result = await ch.query({
    query: `
      SELECT id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
        session_id, path, origin, referrer, referrer_name, referrer_type,
        duration, properties, created_at, country, city, region,
        longitude, latitude, os, os_version, browser, browser_version,
        device, brand, model, imported_at
      FROM ${TABLE_NAMES.events_imports}
      WHERE import_id = {importId:String}
        AND session_id = ''
        AND device != 'server'
      ORDER BY device_id, created_at
    `,
    query_params: { importId },
    format: 'JSONEachRow',
  });

  const stream = result.stream();
  for await (const rows of stream) {
    for (const row of rows) {
      const event = row.json() as IClickhouseEvent;
      const time = new Date(event.created_at).getTime();

      if (event.device_id !== currentDeviceId) {
        currentDeviceId = event.device_id;
        currentSessionId = '';
        currentLastTime = 0;
        currentCounter = -1;
      }

      if (!currentSessionId || time - currentLastTime > SESSION_GAP_MS) {
        currentCounter++;
        currentSessionId = createHash('md5')
          .update(`${event.device_id}-${currentCounter}`)
          .digest('hex')
          .toLowerCase();
      }
      currentLastTime = time;
      event.session_id = currentSessionId;

      batch.push(event);
      if (batch.length >= SESSION_BATCH_SIZE) {
        await insertImportBatch(batch, importId);
        batch.length = 0;
      }
    }
  }

  if (batch.length > 0) {
    await insertImportBatch(batch, importId);
  }

  const mutationTable = getReplicatedTableName(TABLE_NAMES.events_imports);
  await ch.command({
    query: `ALTER TABLE ${mutationTable} DELETE
      WHERE import_id = {importId:String}
        AND session_id = ''
        AND device != 'server'`,
    query_params: { importId },
    clickhouse_settings: {
      wait_end_of_query: 1,
      mutations_sync: '2',
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Delete all staging data for an import. Used to get a clean slate on retry
 * when the failure happened before moving data to production.
 */
export async function cleanupStagingData(importId: string): Promise<void> {
  const { ch, TABLE_NAMES, getReplicatedTableName } = await loadChClient();
  const mutationTableName = getReplicatedTableName(TABLE_NAMES.events_imports);
  await ch.command({
    query: `ALTER TABLE ${mutationTableName} DELETE WHERE import_id = {importId:String}`,
    query_params: { importId },
    clickhouse_settings: {
      wait_end_of_query: 1,
      mutations_sync: '2',
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

export async function cleanupSessionStartEndEvents(
  importId: string
): Promise<void> {
  const { ch, TABLE_NAMES, getReplicatedTableName } = await loadChClient();
  const mutationTableName = getReplicatedTableName(TABLE_NAMES.events_imports);
  await ch.command({
    query: `ALTER TABLE ${mutationTableName} DELETE WHERE import_id = {importId:String} AND name IN ('session_start', 'session_end')`,
    query_params: { importId },
    clickhouse_settings: {
      wait_end_of_query: 1,
      mutations_sync: '2',
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Reconstruct sessions across ALL dates for the import.
 * Each session_id gets exactly one session_start and one session_end,
 * even if the session spans midnight.
 *
 * Batches by fetching distinct session_ids first, then running the
 * heavy aggregation only for that batch of IDs.
 */
export async function createSessionsStartEndEvents(
  importId: string
): Promise<void> {
  const { ch, TABLE_NAMES, convertClickhouseDateToJs, formatClickhouseDate } =
    await loadChClient();
  let lastSessionId = '';

  const baseWhere = [
    'import_id = {importId:String}',
    "session_id != ''",
    "name NOT IN ('session_start', 'session_end')",
  ].join(' AND ');

  while (true) {
    const idsResult = await ch.query({
      query: `
        SELECT DISTINCT session_id
        FROM ${TABLE_NAMES.events_imports}
        WHERE ${baseWhere}
          AND session_id > {lastSessionId:String}
        ORDER BY session_id
        LIMIT {limit:UInt32}
      `,
      query_params: { importId, lastSessionId, limit: SESSION_BATCH_SIZE },
      format: 'JSONEachRow',
    });

    const idRows = (await idsResult.json()) as Array<{ session_id: string }>;
    if (idRows.length === 0) {
      break;
    }

    const maxSessionId = idRows.at(-1)!.session_id;

    const sessionEventsQuery = `
      SELECT
        device_id,
        session_id,
        project_id,
        if(
          any(nullIf(profile_id, device_id)) IS NULL,
          any(profile_id),
          any(nullIf(profile_id, device_id))
        ) AS profile_id,
        argMin((path, origin, referrer, referrer_name, referrer_type, properties, created_at, country, city, region, longitude, latitude, os, os_version, browser, browser_version, device, brand, model), created_at) AS first_event,
        argMax((path, origin, properties, created_at), created_at) AS last_event_fields,
        min(created_at) AS first_timestamp,
        max(created_at) AS last_timestamp
      FROM ${TABLE_NAMES.events_imports}
      WHERE ${baseWhere}
        AND session_id > {lastSessionId:String}
        AND session_id <= {maxSessionId:String}
      GROUP BY session_id, device_id, project_id
    `;

    const sessionEventsResult = await ch.query({
      query: sessionEventsQuery,
      query_params: { importId, lastSessionId, maxSessionId },
      format: 'JSONEachRow',
    });

    const sessionData = (await sessionEventsResult.json()) as Array<{
      device_id: string;
      session_id: string;
      project_id: string;
      profile_id: string;
      first_event: [
        string, // path
        string, // origin
        string, // referrer
        string, // referrer_name
        string, // referrer_type
        Record<string, unknown>, // properties
        string, // created_at
        string, // country
        string, // city
        string, // region
        number | null, // longitude
        number | null, // latitude
        string, // os
        string, // os_version
        string, // browser
        string, // browser_version
        string, // device
        string, // brand
        string, // model
      ];
      last_event_fields: [
        string, // path
        string, // origin
        Record<string, unknown>, // properties
        string, // created_at
      ];
      first_timestamp: string;
      last_timestamp: string;
    }>;

    const sessionEvents: IClickhouseEvent[] = [];

    const adjustTimestamp = (timestamp: string, offsetMs: number): string => {
      const date = convertClickhouseDateToJs(timestamp);
      date.setTime(date.getTime() + offsetMs);
      return formatClickhouseDate(date);
    };

    for (const session of sessionData) {
      const [
        firstPath,
        firstOrigin,
        firstReferrer,
        firstReferrerName,
        firstReferrerType,
        firstProperties,
        _firstCreatedAt,
        firstCountry,
        firstCity,
        firstRegion,
        firstLongitude,
        firstLatitude,
        firstOs,
        firstOsVersion,
        firstBrowser,
        firstBrowserVersion,
        firstDevice,
        firstBrand,
        firstModel,
      ] = session.first_event;

      const [lastPath, lastOrigin, lastProperties, _lastCreatedAt] =
        session.last_event_fields;

      const firstTime = new Date(session.first_timestamp).getTime();
      const lastTime = new Date(session.last_timestamp).getTime();
      const durationMs = Math.max(0, lastTime - firstTime);

      sessionEvents.push({
        id: crypto.randomUUID(),
        name: 'session_start',
        device_id: session.device_id,
        profile_id: session.profile_id,
        project_id: session.project_id,
        session_id: session.session_id,
        groups: [],
        path: firstPath,
        origin: firstOrigin,
        referrer: firstReferrer,
        referrer_name: firstReferrerName,
        referrer_type: firstReferrerType,
        duration: 0,
        properties: firstProperties as Record<
          string,
          string | number | boolean | null | undefined
        >,
        created_at: adjustTimestamp(session.first_timestamp, -1000),
        country: firstCountry,
        city: firstCity,
        region: firstRegion,
        longitude: firstLongitude,
        latitude: firstLatitude,
        os: firstOs,
        os_version: firstOsVersion,
        browser: firstBrowser,
        browser_version: firstBrowserVersion,
        device: firstDevice,
        brand: firstBrand,
        model: firstModel,
        imported_at: new Date().toISOString(),
        sdk_name: 'import-session-reconstruction',
        sdk_version: '1.0.0',
      });

      sessionEvents.push({
        id: crypto.randomUUID(),
        name: 'session_end',
        device_id: session.device_id,
        profile_id: session.profile_id,
        project_id: session.project_id,
        session_id: session.session_id,
        groups: [],
        path: lastPath,
        origin: lastOrigin,
        referrer: firstReferrer,
        referrer_name: firstReferrerName,
        referrer_type: firstReferrerType,
        duration: durationMs,
        properties: lastProperties as Record<
          string,
          string | number | boolean | null | undefined
        >,
        created_at: adjustTimestamp(session.last_timestamp, 1000),
        country: firstCountry,
        city: firstCity,
        region: firstRegion,
        longitude: firstLongitude,
        latitude: firstLatitude,
        os: firstOs,
        os_version: firstOsVersion,
        browser: firstBrowser,
        browser_version: firstBrowserVersion,
        device: firstDevice,
        brand: firstBrand,
        model: firstModel,
        imported_at: new Date().toISOString(),
        sdk_name: 'import-session-reconstruction',
        sdk_version: '1.0.0',
      });
    }

    if (sessionEvents.length > 0) {
      await insertImportBatch(sessionEvents, importId);
    }

    lastSessionId = maxSessionId;
    if (idRows.length < SESSION_BATCH_SIZE) {
      break;
    }
  }
}

/**
 * Move events from staging to production events table.
 * Batched per-day using a simple date filter.
 */
export async function moveImportsToProduction(
  importId: string,
  from: string
): Promise<void> {
  const { ch, TABLE_NAMES } = await loadChClient();
  let whereClause = 'import_id = {importId:String}';

  if (from) {
    whereClause += ' AND toDate(created_at) = {from:String}';
  }

  const migrationQuery = `
    INSERT INTO ${TABLE_NAMES.events} (
      id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
      session_id, path, origin, referrer, referrer_name, referrer_type,
      duration, properties, created_at, country, city, region,
      longitude, latitude, os, os_version, browser, browser_version,
      device, brand, model, imported_at, inserted_at
    )
    SELECT
      id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
      session_id, path, origin, referrer, referrer_name, referrer_type,
      duration, properties, created_at, country, city, region,
      longitude, latitude, os, os_version, browser, browser_version,
      device, brand, model, imported_at, now64(3) AS inserted_at
    FROM ${TABLE_NAMES.events_imports}
    WHERE ${whereClause}
    ORDER BY created_at ASC
  `;

  await ch.command({
    query: migrationQuery,
    query_params: { importId, from },
    clickhouse_settings: {
      wait_end_of_query: 1,
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Aggregate sessions from staging into the sessions table.
 * Runs across all dates so cross-midnight sessions become one row.
 * Batches by session_ids to bound ClickHouse memory.
 */
export async function backfillSessionsToProduction(
  importId: string
): Promise<void> {
  const { ch, TABLE_NAMES } = await loadChClient();
  let lastSessionId = '';

  while (true) {
    const idsResult = await ch.query({
      query: `
        SELECT DISTINCT session_id
        FROM ${TABLE_NAMES.events_imports}
        WHERE import_id = {importId:String}
          AND session_id > {lastSessionId:String}
        ORDER BY session_id
        LIMIT {limit:UInt32}
      `,
      query_params: { importId, lastSessionId, limit: SESSION_BATCH_SIZE },
      format: 'JSONEachRow',
    });

    const idRows = (await idsResult.json()) as Array<{ session_id: string }>;
    if (idRows.length === 0) {
      break;
    }

    const maxSessionId = idRows.at(-1)!.session_id;

    const sessionsInsertQuery = `
      INSERT INTO ${TABLE_NAMES.sessions} (
        id, project_id, profile_id, device_id, created_at, ended_at,
        is_bounce, entry_origin, entry_path, exit_origin, exit_path,
        screen_view_count, revenue, event_count, duration,
        country, region, city, longitude, latitude,
        device, brand, model, browser, browser_version, os, os_version,
        sign, version,
        utm_medium, utm_source, utm_campaign, utm_content, utm_term,
        referrer, referrer_name, referrer_type
      )
      SELECT
        any(e.session_id) as id,
        any(e.project_id) as project_id,
        if(any(nullIf(e.profile_id, e.device_id)) IS NULL, any(e.profile_id), any(nullIf(e.profile_id, e.device_id))) as profile_id,
        any(e.device_id) as device_id,
        argMin(e.created_at, e.created_at) as created_at,
        argMax(e.created_at, e.created_at) as ended_at,
        if(
          argMaxIf(e.properties['__bounce'], e.created_at, e.name = 'session_end') = '',
          if(countIf(e.name = 'screen_view') > 1, false, true),
          argMaxIf(e.properties['__bounce'], e.created_at, e.name = 'session_end') = 'true'
        ) as is_bounce,
        argMinIf(e.origin, e.created_at, e.name = 'session_start') as entry_origin,
        argMinIf(e.path, e.created_at, e.name = 'session_start') as entry_path,
        argMaxIf(e.origin, e.created_at, e.name = 'session_end' OR e.name = 'screen_view') as exit_origin,
        argMaxIf(e.path, e.created_at, e.name = 'session_end' OR e.name = 'screen_view') as exit_path,
        countIf(e.name = 'screen_view') as screen_view_count,
        0 as revenue,
        countIf(e.name != 'screen_view' AND e.name != 'session_start' AND e.name != 'session_end') as event_count,
        sumIf(e.duration, name = 'session_end') AS duration,
        argMinIf(e.country, e.created_at, e.name = 'session_start') as country,
        argMinIf(e.region, e.created_at, e.name = 'session_start') as region,
        argMinIf(e.city, e.created_at, e.name = 'session_start') as city,
        argMinIf(e.longitude, e.created_at, e.name = 'session_start') as longitude,
        argMinIf(e.latitude, e.created_at, e.name = 'session_start') as latitude,
        argMinIf(e.device, e.created_at, e.name = 'session_start') as device,
        argMinIf(e.brand, e.created_at, e.name = 'session_start') as brand,
        argMinIf(e.model, e.created_at, e.name = 'session_start') as model,
        argMinIf(e.browser, e.created_at, e.name = 'session_start') as browser,
        argMinIf(e.browser_version, e.created_at, e.name = 'session_start') as browser_version,
        argMinIf(e.os, e.created_at, e.name = 'session_start') as os,
        argMinIf(e.os_version, e.created_at, e.name = 'session_start') as os_version,
        1 as sign,
        1 as version,
        argMinIf(e.properties['__query.utm_medium'], e.created_at, e.name = 'session_start') as utm_medium,
        argMinIf(e.properties['__query.utm_source'], e.created_at, e.name = 'session_start') as utm_source,
        argMinIf(e.properties['__query.utm_campaign'], e.created_at, e.name = 'session_start') as utm_campaign,
        argMinIf(e.properties['__query.utm_content'], e.created_at, e.name = 'session_start') as utm_content,
        argMinIf(e.properties['__query.utm_term'], e.created_at, e.name = 'session_start') as utm_term,
        argMinIf(e.referrer, e.created_at, e.name = 'session_start') as referrer,
        argMinIf(e.referrer_name, e.created_at, e.name = 'session_start') as referrer_name,
        argMinIf(e.referrer_type, e.created_at, e.name = 'session_start') as referrer_type
      FROM ${TABLE_NAMES.events_imports} e
      WHERE
        e.import_id = {importId:String}
        AND e.session_id > {lastSessionId:String}
        AND e.session_id <= {maxSessionId:String}
      GROUP BY e.session_id
    `;

    await ch.command({
      query: sessionsInsertQuery,
      query_params: { importId, lastSessionId, maxSessionId },
      clickhouse_settings: {
        wait_end_of_query: 1,
        send_progress_in_http_headers: 1,
        http_headers_progress_interval_ms: '50000',
      },
    });

    lastSessionId = maxSessionId;
    if (idRows.length < SESSION_BATCH_SIZE) {
      break;
    }
  }
}

/**
 * Get min/max created_at for an import's staging data.
 */
export async function getImportDateBounds(
  importId: string,
  fromCreatedAt?: string
): Promise<{ min: string | null; max: string | null }> {
  const { ch, TABLE_NAMES } = await loadChClient();
  const res = await ch.query({
    query: `
      SELECT min(created_at) AS min, max(created_at) AS max
      FROM ${TABLE_NAMES.events_imports}
      WHERE import_id = {importId:String}
      AND name NOT IN ('session_start', 'session_end')
      ${fromCreatedAt ? 'AND created_at >= {fromCreatedAt:String}' : ''}
    `,
    query_params: { importId, fromCreatedAt },
    format: 'JSONEachRow',
  });
  const rows = (await res.json()) as Array<{
    min: string | null;
    max: string | null;
  }>;
  return rows.length > 0
    ? {
        min: fromCreatedAt ?? rows[0]?.min ?? null,
        max: rows[0]?.max ?? null,
      }
    : { min: null, max: null };
}

/**
 * Reports progress on a running import. Wraps V1's `job.updateProgress` — a
 * BullMQ `Job` satisfies this structurally, so the V1 worker delegate passes
 * its real job straight through. Core's own job runner (import.jobs.ts) has
 * no BullMQ job object to hand over (`JobCtx.job` is the erased
 * `{id, attempt, queue, name}`, not the live BullMQ handle), so it falls back
 * to the no-op default.
 */
export interface ImportJobProgress {
  updateProgress(progress: Record<string, unknown>): unknown;
}

const NOOP_PROGRESS: ImportJobProgress = { updateProgress: () => undefined };

export type UpdateImportStatusOptions =
  | {
      step: 'loading';
      batch?: string;
      totalEvents?: number;
      processedEvents?: number;
    }
  | {
      step: 'loading_profiles';
      processedProfiles?: number;
      totalProfiles?: number;
    }
  | {
      step: 'creating_sessions';
      batch?: string;
    }
  | {
      step: 'generating_sessions';
    }
  | {
      step: 'moving';
      batch?: string;
    }
  | {
      step: 'backfilling_sessions';
      batch?: string;
    }
  | {
      step: 'completed';
    }
  | {
      step: 'failed';
      errorMessage?: string;
    };

export type ImportSteps = UpdateImportStatusOptions['step'];

export async function updateImportStatus(
  jobLogger: Logger,
  progress: ImportJobProgress,
  importId: string,
  options: UpdateImportStatusOptions
): Promise<void> {
  const db = await loadDb();
  const data: Prisma.ImportUpdateInput = {};
  switch (options.step) {
    case 'loading':
      data.status = 'processing';
      data.currentStep = 'loading';
      data.currentBatch = options.batch;
      data.statusMessage = options.batch
        ? `Importing events from ${options.batch}`
        : 'Initializing...';
      data.totalEvents = options.totalEvents;
      data.processedEvents = options.processedEvents;
      break;
    case 'loading_profiles':
      data.currentStep = 'loading_profiles';
      data.statusMessage =
        options.processedProfiles != null && options.totalProfiles != null
          ? `Importing user profiles (${options.processedProfiles} / ${options.totalProfiles})`
          : 'Importing user profiles...';
      break;
    case 'creating_sessions':
      data.currentStep = 'creating_sessions';
      data.currentBatch = options.batch;
      data.statusMessage = options.batch
        ? `Creating sessions (${options.batch})`
        : 'Creating sessions...';
      break;
    case 'generating_sessions':
      data.currentStep = 'generating_sessions';
      data.statusMessage = 'Generating session IDs...';
      break;
    case 'moving':
      data.currentStep = 'moving';
      data.currentBatch = options.batch;
      data.statusMessage = `Moving events to production (${options.batch})`;
      break;
    case 'backfilling_sessions':
      data.currentStep = 'backfilling_sessions';
      data.currentBatch = options.batch;
      data.statusMessage = options.batch
        ? `Aggregating sessions (${options.batch})`
        : 'Aggregating sessions...';
      break;
    case 'completed':
      data.status = 'completed';
      data.currentStep = 'completed';
      data.statusMessage = 'Import completed';
      data.completedAt = new Date();
      break;
    case 'failed':
      data.status = 'failed';
      data.statusMessage = 'Import failed';
      data.errorMessage = options.errorMessage;
      break;
    default:
      break;
  }

  jobLogger.info({ data }, 'Import status update');

  await progress.updateProgress(data);

  await db.import.update({
    where: { id: importId },
    data,
  });
}

// ---------------------------------------------------------------------------
// Provider dispatch + job body — moved from apps/worker/src/jobs/import.ts.
// ---------------------------------------------------------------------------

/**
 * Merge a freshly-derived profile into the bounded dedup map: keep the earliest
 * created_at (first seen), advance last_seen_at to the latest activity, and fill
 * identity fields/properties, preferring the newer row.
 */
function mergeProfileInto(
  map: Map<string, IClickhouseProfile>,
  incoming: IClickhouseProfile
): void {
  const existing = map.get(incoming.id);
  if (!existing) {
    map.set(incoming.id, incoming);
    return;
  }

  const createdAt =
    existing.created_at < incoming.created_at
      ? existing.created_at
      : incoming.created_at;
  const isIncomingNewer = incoming.last_seen_at >= existing.last_seen_at;
  const base = isIncomingNewer ? incoming : existing;
  const other = isIncomingNewer ? existing : incoming;

  map.set(incoming.id, {
    ...base,
    created_at: createdAt,
    first_name: base.first_name || other.first_name,
    last_name: base.last_name || other.last_name,
    email: base.email || other.email,
    avatar: base.avatar || other.avatar,
    properties: { ...other.properties, ...base.properties },
  });
}

/** Structural subset of a provider instance the job body actually drives. */
interface RunnableProvider {
  shouldGenerateSessionIds(): boolean;
  getTotalEventsCount(): Promise<number>;
  parseSource(): AsyncGenerator<unknown, void, unknown>;
  validate(rawEvent: unknown): boolean;
  transformEvent(rawEvent: unknown): IClickhouseEvent;
  transformEventToProfile?(rawEvent: unknown): IClickhouseProfile | null;
  streamProfiles?(): AsyncGenerator<unknown, void, unknown>;
  transformProfile?(rawProfile: unknown): IClickhouseProfile;
}

/** Dynamic import keeps @openpanel/db's clickhouse client off this file's eager path (see header). */
async function createImportProvider(
  projectId: string,
  config: IImportConfig,
  jobLogger: Logger
): Promise<RunnableProvider> {
  switch (config.provider) {
    case 'umami': {
      const { UmamiProvider } = await import('./src/providers/umami');
      return new UmamiProvider(projectId, config, jobLogger);
    }
    case 'mixpanel': {
      const { MixpanelProvider } = await import('./src/providers/mixpanel');
      return new MixpanelProvider(projectId, config, jobLogger);
    }
    case 'amplitude': {
      const { AmplitudeProvider } = await import('./src/providers/amplitude');
      return new AmplitudeProvider(projectId, config, jobLogger);
    }
    default:
      throw new Error(
        `Unknown provider: ${(config as { provider: string }).provider}`
      );
  }
}

/**
 * The `import` queue job body. Ported verbatim from apps/worker/src/jobs/
 * import.ts's `importJob`, with the BullMQ `Job` split into `importId` +
 * `progress` (see `ImportJobProgress`'s header) so the same body serves V1's
 * worker delegate and core's own (not yet live) `import` queue worker.
 */
export async function runImportJob(
  importId: string,
  progress: ImportJobProgress = NOOP_PROGRESS,
  logger: Logger = getLogger()
): Promise<{ success: true }> {
  const db = await loadDb();
  const record = await db.import.findUniqueOrThrow({
    where: { id: importId },
    include: { project: true },
  });

  const jobLogger = logger.child({ importId, config: record.config });
  jobLogger.info('Starting import job');

  const providerInstance = await createImportProvider(
    record.projectId,
    record.config,
    jobLogger
  );
  const shouldGenerateSessionIds = providerInstance.shouldGenerateSessionIds();

  try {
    const isRetry = record.currentStep !== null;
    const canResume =
      isRetry && RESUMABLE_STEPS.includes(record.currentStep as string);

    // -------------------------------------------------------
    // STAGING PHASE: clean slate on failure, run from scratch
    // -------------------------------------------------------
    if (!canResume) {
      if (isRetry) {
        jobLogger.info(
          'Retry detected before resumable phase — cleaning staging data'
        );
        await cleanupStagingData(importId);
      }

      // Phase 1: Load events into staging
      await updateImportStatus(jobLogger, progress, importId, {
        step: 'loading',
      });

      const totalEvents = await providerInstance
        .getTotalEventsCount()
        .catch(() => -1);
      let processedEvents = 0;
      const eventBatch: IClickhouseEvent[] = [];

      const canProfileFromEvents =
        typeof providerInstance.transformEventToProfile === 'function';
      const profileMap = new Map<string, IClickhouseProfile>();
      let processedProfiles = 0;

      const flushProfiles = async () => {
        if (profileMap.size === 0) {
          return;
        }
        const values = Array.from(profileMap.values());
        await insertProfilesBatch(values, record.projectId);
        processedProfiles += values.length;
        profileMap.clear();
        await updateImportStatus(jobLogger, progress, importId, {
          step: 'loading_profiles',
          processedProfiles,
        });
        await yieldToEventLoop();
      };

      for await (const rawEvent of providerInstance.parseSource()) {
        if (!providerInstance.validate(rawEvent)) {
          jobLogger.warn({ rawEvent }, 'Skipping invalid event');
          continue;
        }

        const transformed = providerInstance.transformEvent(rawEvent);

        // Session IDs for providers that need them (e.g. Mixpanel) are generated
        // in generateGapBasedSessionIds after loading, using gap-based logic.
        eventBatch.push(transformed);

        if (canProfileFromEvents) {
          const profile = providerInstance.transformEventToProfile?.(rawEvent);
          if (profile) {
            mergeProfileInto(profileMap, profile);
            if (profileMap.size >= PROFILE_MAP_CAP) {
              await flushProfiles();
            }
          }
        }

        if (eventBatch.length >= BATCH_SIZE) {
          await insertImportBatch(eventBatch, importId);
          processedEvents += eventBatch.length;

          const batchDate = new Date(eventBatch[0]?.created_at || '')
            .toISOString()
            .split('T')[0];

          await updateImportStatus(jobLogger, progress, importId, {
            step: 'loading',
            batch: batchDate,
            totalEvents,
            processedEvents,
          });

          eventBatch.length = 0;
          await yieldToEventLoop();
        }
      }

      if (eventBatch.length > 0) {
        await insertImportBatch(eventBatch, importId);
        processedEvents += eventBatch.length;

        const batchDate = new Date(eventBatch[0]?.created_at || '')
          .toISOString()
          .split('T')[0];

        await updateImportStatus(jobLogger, progress, importId, {
          step: 'loading',
          batch: batchDate,
          totalEvents,
          processedEvents,
        });
        eventBatch.length = 0;
      }

      jobLogger.info({ processedEvents }, 'Loading complete');

      // Phase 1a: Flush profiles derived inline from events (Amplitude)
      if (canProfileFromEvents) {
        await flushProfiles();
        jobLogger.info(
          { processedProfiles },
          'Inline profile derivation complete'
        );
      }

      // Phase 1b: Load user profiles (Mixpanel only)
      if (typeof providerInstance.streamProfiles === 'function') {
        await updateImportStatus(jobLogger, progress, importId, {
          step: 'loading_profiles',
        });

        const profileBatch: IClickhouseProfile[] = [];
        let profilesLoaded = 0;

        for await (const rawProfile of providerInstance.streamProfiles()) {
          const profile = providerInstance.transformProfile?.(rawProfile);
          if (!profile) {
            continue;
          }
          profileBatch.push(profile);

          if (profileBatch.length >= PROFILE_BATCH_SIZE) {
            await insertProfilesBatch(profileBatch, record.projectId);
            profilesLoaded += profileBatch.length;
            await updateImportStatus(jobLogger, progress, importId, {
              step: 'loading_profiles',
              processedProfiles: profilesLoaded,
            });
            profileBatch.length = 0;
            await yieldToEventLoop();
          }
        }

        if (profileBatch.length > 0) {
          await insertProfilesBatch(profileBatch, record.projectId);
          profilesLoaded += profileBatch.length;
          await updateImportStatus(jobLogger, progress, importId, {
            step: 'loading_profiles',
            processedProfiles: profilesLoaded,
            totalProfiles: profilesLoaded,
          });
        }

        jobLogger.info(
          { processedProfiles: profilesLoaded },
          'Profile loading complete'
        );
      }

      // Phase 2: Generate gap-based session IDs (Mixpanel etc.)
      if (shouldGenerateSessionIds) {
        await updateImportStatus(jobLogger, progress, importId, {
          step: 'generating_sessions',
        });
        await generateGapBasedSessionIds(importId);
        await yieldToEventLoop();
        jobLogger.info('Session ID generation complete');
      }
    }

    // -------------------------------------------------------
    // SESSION CREATION PHASE: resumable by cleaning session_start/end
    // -------------------------------------------------------
    const skipSessionCreation =
      canResume && record.currentStep !== 'creating_sessions';

    if (!skipSessionCreation) {
      if (canResume && record.currentStep === 'creating_sessions') {
        jobLogger.info(
          'Retry at creating_sessions — cleaning existing session_start/end events'
        );
        await cleanupSessionStartEndEvents(importId);
      }

      await updateImportStatus(jobLogger, progress, importId, {
        step: 'creating_sessions',
        batch: 'all sessions',
      });
      await createSessionsStartEndEvents(importId);
      await yieldToEventLoop();

      jobLogger.info('Session event creation complete');
    }

    // -------------------------------------------------------
    // PRODUCTION PHASE: resume-safe, track progress per batch
    // -------------------------------------------------------

    // Phase 3: Move staging events to production (per-day)
    const resumeMovingFrom =
      canResume && record.currentStep === 'moving'
        ? (record.currentBatch ?? undefined)
        : undefined;

    // currentBatch is the last successfully completed day — resume from the next day to avoid re-inserting it
    const moveFromDate = (() => {
      if (!resumeMovingFrom) {
        return undefined;
      }
      const next = new Date(`${resumeMovingFrom}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString().split('T')[0]!;
    })();

    const bounds = await getImportDateBounds(importId, moveFromDate);
    if (bounds.min && bounds.max) {
      const startDate = bounds.min.split(' ')[0]!;
      const endDate = bounds.max.split(' ')[0]!;
      const cursor = new Date(`${startDate}T12:00:00Z`);
      const end = new Date(`${endDate}T12:00:00Z`);

      while (cursor <= end) {
        const dateStr = cursor.toISOString().split('T')[0]!;

        await moveImportsToProduction(importId, dateStr);
        await updateImportStatus(jobLogger, progress, importId, {
          step: 'moving',
          batch: dateStr,
        });

        await yieldToEventLoop();
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    jobLogger.info('Move to production complete');

    // Phase 4: Backfill sessions table
    await updateImportStatus(jobLogger, progress, importId, {
      step: 'backfilling_sessions',
      batch: 'all sessions',
    });
    await backfillSessionsToProduction(importId);
    await yieldToEventLoop();

    jobLogger.info('Session backfill complete');

    // Done
    await updateImportStatus(jobLogger, progress, importId, {
      step: 'completed',
    });
    jobLogger.info('Import completed');

    return { success: true };
  } catch (error) {
    jobLogger.error({ err: error }, 'Import job failed');

    try {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await updateImportStatus(jobLogger, progress, importId, {
        step: 'failed',
        errorMessage: errorMsg,
      });
    } catch (markError) {
      jobLogger.error(
        { err: error, markError },
        'Failed to mark import as failed'
      );
    }

    throw error;
  }
}

// ---------------------------------------------------------------------------
// /import/events — moved from apps/api/src/controllers/import.controller.ts.
// Bulk-inserts already-shaped events straight into production; unrelated to
// the provider/staging pipeline above (no Import record, no ClickHouse
// staging table).
// ---------------------------------------------------------------------------

export interface InsertRawEventsResult {
  writtenRows: number;
}

export async function insertRawEventsBatch(
  projectId: string,
  events: IClickhouseEvent[],
  logger: Logger = getLogger()
): Promise<InsertRawEventsResult> {
  const { ch, TABLE_NAMES, formatClickhouseDate } = await loadChClient();
  const importedAt = formatClickhouseDate(new Date());
  const values: IClickhouseEvent[] = events.map((event) => ({
    ...event,
    properties: toDots(event.properties),
    project_id: projectId,
    created_at: formatClickhouseDate(event.created_at),
    imported_at: importedAt,
  }));

  const res = await ch.insert({
    table: TABLE_NAMES.events,
    values,
    format: 'JSONEachRow',
  });

  // ClickHouse's insert summary reports written_rows as a string.
  const writtenRows = Number(res.summary?.written_rows ?? 0);
  logger.info({ writtenRows, projectId }, 'events imported');
  return { writtenRows };
}

// ---------------------------------------------------------------------------
// `ctx.services.import` binding.
// ---------------------------------------------------------------------------

export interface ImportService {
  run(
    importId: string,
    progress?: ImportJobProgress
  ): Promise<{ success: true }>;
  /** Enqueues the `import` job and returns its BullMQ job id, for `Import.jobId`. */
  enqueue(importId: string): Promise<string>;
}

/** `ctx.services.import` — a thin binding of the job body above to a Ctx's queues. */
export function createImportService(deps: ServiceDeps): ImportService {
  const logger = deps.logger.child({ module: 'import' });

  return {
    run: (importId, progress) => runImportJob(importId, progress, logger),
    enqueue: (importId) => deps.queues.import.import.add({ importId }),
  };
}
