import { createHash } from 'node:crypto';
import type { ILogger } from '@openpanel/logger';
import {
  ch,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  getReplicatedTableName,
  TABLE_NAMES,
} from '../clickhouse/client';
import { db, type Prisma } from '../prisma-client';
import type { IClickhouseProfile } from './profile.service';
import type { IClickhouseEvent } from './event.service';

export interface ImportStageResult {
  importId: string;
  totalEvents: number;
  insertedEvents: number;
}

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate gap-based session IDs for events that have none.
 * Streams events from staging (sorted by device_id, created_at), assigns a new
 * session when gap > 30 min, re-inserts with session_id, then deletes old rows.
 */
export async function generateGapBasedSessionIds(
  importId: string
): Promise<void> {
  let currentDeviceId = '';
  let currentSessionId = '';
  let currentLastTime = 0;
  let currentCounter = -1;
  const BATCH_SIZE = 5000;
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
      if (batch.length >= BATCH_SIZE) {
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
 * Insert a batch of events into the imports staging table
 */
export async function insertImportBatch(
  events: IClickhouseEvent[],
  importId: string
): Promise<ImportStageResult> {
  if (events.length === 0) {
    return { importId, totalEvents: 0, insertedEvents: 0 };
  }

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
  }));

  await ch.insert({
    table: TABLE_NAMES.profiles,
    values: normalized,
    format: 'JSONEachRow',
  });

  return { inserted: normalized.length };
}

































/**
 * Delete all staging data for an import. Used to get a clean slate on retry
 * when the failure happened before moving data to production.
 */
export async function cleanupStagingData(importId: string): Promise<void> {
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
  const SESSION_BATCH_SIZE = 5000;
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

    const sessionIds = idRows.map((r) => r.session_id);

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
        AND session_id IN ({sessionIds:Array(String)})
      GROUP BY session_id, device_id, project_id
    `;

    const sessionEventsResult = await ch.query({
      query: sessionEventsQuery,
      query_params: { importId, sessionIds },
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

    lastSessionId = idRows[idRows.length - 1]!.session_id;
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
      device, brand, model, imported_at
    )
    SELECT 
      id, name, sdk_name, sdk_version, device_id, profile_id, project_id,
      session_id, path, origin, referrer, referrer_name, referrer_type,
      duration, properties, created_at, country, city, region,
      longitude, latitude, os, os_version, browser, browser_version,
      device, brand, model, imported_at
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
  const SESSION_BATCH_SIZE = 5000;
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

    const sessionIds = idRows.map((r) => r.session_id);

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
        AND e.session_id IN ({sessionIds:Array(String)})
      GROUP BY e.session_id
    `;

    await ch.command({
      query: sessionsInsertQuery,
      query_params: { importId, sessionIds },
      clickhouse_settings: {
        wait_end_of_query: 1,
        send_progress_in_http_headers: 1,
        http_headers_progress_interval_ms: '50000',
      },
    });

    lastSessionId = idRows[idRows.length - 1]!.session_id;
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
  jobLogger: ILogger,
  job: {
    updateProgress: (progress: Record<string, any>) => void;
  },
  importId: string,
  options: UpdateImportStatusOptions
): Promise<void> {
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

  jobLogger.info('Import status update', data);

  await job.updateProgress(data);

  await db.import.update({
    where: { id: importId },
    data,
  });
}
