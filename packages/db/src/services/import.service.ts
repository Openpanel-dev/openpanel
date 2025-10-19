import type { ILogger } from '@openpanel/logger';
import sqlstring from 'sqlstring';
import {
  TABLE_NAMES,
  ch,
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '../clickhouse/client';
import { type Prisma, db } from '../prisma-client';
import type { IClickhouseEvent } from './event.service';

export interface ImportStageResult {
  importId: string;
  totalEvents: number;
  insertedEvents: number;
}

export interface ImportProgress {
  importId: string;
  totalEvents: number;
  insertedEvents: number;
  status: 'pending' | 'processing' | 'processed' | 'failed';
}

/**
 * Insert a batch of events into the imports staging table
 */
export async function insertImportBatch(
  events: IClickhouseEvent[],
  importId: string,
): Promise<ImportStageResult> {
  if (events.length === 0) {
    return { importId, totalEvents: 0, insertedEvents: 0 };
  }

  // Add import metadata to each event
  const eventsWithMetadata = events.map((event) => ({
    ...event,
    import_id: importId,
    import_status: 'pending',
    imported_at_meta: new Date(),
  }));

  await ch.insert({
    table: TABLE_NAMES.events_imports,
    values: eventsWithMetadata,
    format: 'JSONEachRow',
  });

  return {
    importId,
    totalEvents: events.length,
    insertedEvents: events.length,
  };
}

/**
 * Generate deterministic session IDs for events that don't have them
 * Uses 30-minute time windows to create consistent session IDs across imports
 * Only processes events where device != 'server' and session_id = ''
 */
export async function generateSessionIds(
  importId: string,
  from: string,
): Promise<void> {
  const rangeWhere = [
    'import_id = {importId:String}',
    "import_status = 'pending'",
    "device != 'server'",
    "session_id = ''",
    from ? 'toDate(created_at) = {from:String}' : '',
  ]
    .filter(Boolean)
    .join(' AND ');

  // Use SQL to generate deterministic session IDs based on device_id + 30-min time windows
  // This ensures same events always get same session IDs regardless of import order
  const updateQuery = `
    ALTER TABLE ${TABLE_NAMES.events_imports}
    UPDATE session_id = lower(hex(MD5(concat(
      device_id,
      '-',
      toString(toInt64(toUnixTimestamp(created_at) / 1800))
    ))))
    WHERE ${rangeWhere}
  `;

  await ch.command({
    query: updateQuery,
    query_params: { importId, from },
    clickhouse_settings: {
      wait_end_of_query: 1,
      mutations_sync: '2', // Wait for mutation to complete on all replicas (critical!)
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Reconstruct sessions using SQL-based logic
 * This identifies session boundaries and creates session_start/session_end events
 * session_start inherits all properties from the first event in the session
 * session_end inherits all properties from the last event in the session and calculates duration
 */
export async function createSessionsStartEndEvents(
  importId: string,
  from: string,
): Promise<void> {
  // First, let's identify session boundaries and get first/last events for each session
  const rangeWhere = [
    'import_id = {importId:String}',
    "import_status = 'pending'",
    "session_id != ''", // Only process events that have session IDs
    'toDate(created_at) = {from:String}',
  ]
    .filter(Boolean)
    .join(' AND ');

  // Use window functions to efficiently get first event (all fields) and last event (only changing fields)
  // session_end only needs: properties, path, origin, created_at - the rest can be inherited from session_start
  const sessionEventsQuery = `
    SELECT
      device_id,
      session_id,
      project_id,
      profile_id,
      argMin((path, origin, referrer, referrer_name, referrer_type, properties, created_at, country, city, region, longitude, latitude, os, os_version, browser, browser_version, device, brand, model), created_at) AS first_event,
      argMax((path, origin, properties, created_at), created_at) AS last_event_fields,
      min(created_at) AS first_timestamp,
      max(created_at) AS last_timestamp
    FROM ${TABLE_NAMES.events_imports}
    WHERE ${rangeWhere}
      AND name NOT IN ('session_start', 'session_end')
    GROUP BY session_id, device_id, project_id, profile_id
  `;

  const sessionEventsResult = await ch.query({
    query: sessionEventsQuery,
    query_params: { importId, from },
    format: 'JSONEachRow',
  });

  const sessionData = (await sessionEventsResult.json()) as Array<{
    device_id: string;
    session_id: string;
    project_id: string;
    profile_id: string;
    first_event: [
      // string, // id
      // string, // name
      string, // path
      string, // origin
      string, // referrer
      string, // referrer_name
      string, // referrer_type
      // number, // duration
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
      // string, // sdk_name
      // string, // sdk_version
      // string, // imported_at
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

  // Create session_start and session_end events
  const sessionEvents: IClickhouseEvent[] = [];

  for (const session of sessionData) {
    // Destructure first event tuple (all fields)
    const [
      // firstId,
      // firstName,
      firstPath,
      firstOrigin,
      firstReferrer,
      firstReferrerName,
      firstReferrerType,
      // firstDuration,
      firstProperties,
      firstCreatedAt,
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
      // firstSdkName,
      // firstSdkVersion,
      // firstImportedAt,
    ] = session.first_event;

    // Destructure last event fields (only the changing ones)
    const [lastPath, lastOrigin, lastProperties, lastCreatedAt] =
      session.last_event_fields;

    // Calculate duration in milliseconds
    // Parse timestamps as Date objects to calculate duration
    const firstTime = new Date(session.first_timestamp).getTime();
    const lastTime = new Date(session.last_timestamp).getTime();
    const durationMs = lastTime - firstTime;

    // Helper function to adjust timestamp by milliseconds without timezone conversion
    const adjustTimestamp = (timestamp: string, offsetMs: number): string => {
      // Parse the timestamp, adjust it, and format back to ClickHouse format
      const date = convertClickhouseDateToJs(timestamp);
      date.setTime(date.getTime() + offsetMs);
      return formatClickhouseDate(date);
    };

    // Create session_start event - inherit everything from first event but change name
    // Set created_at to 1 second before the first event
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
      duration: 0, // session_start always has 0 duration
      properties: firstProperties as Record<
        string,
        string | number | boolean | null | undefined
      >,
      created_at: adjustTimestamp(session.first_timestamp, -1000), // 1 second before first event
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

    // Create session_end event - inherit most from session_start, but use last event's path, origin, properties
    // Set created_at to 1 second after the last event
    sessionEvents.push({
      id: crypto.randomUUID(),
      name: 'session_end',
      device_id: session.device_id,
      profile_id: session.profile_id,
      project_id: session.project_id,
      session_id: session.session_id,
      path: lastPath, // From last event
      origin: lastOrigin, // From last event
      referrer: firstReferrer, // Same as session_start
      referrer_name: firstReferrerName, // Same as session_start
      referrer_type: firstReferrerType, // Same as session_start
      duration: durationMs,
      properties: lastProperties as Record<
        string,
        string | number | boolean | null | undefined
      >, // From last event
      created_at: adjustTimestamp(session.last_timestamp, 1000), // 1 second after last event
      country: firstCountry, // Same as session_start
      city: firstCity, // Same as session_start
      region: firstRegion, // Same as session_start
      longitude: firstLongitude, // Same as session_start
      latitude: firstLatitude, // Same as session_start
      os: firstOs, // Same as session_start
      os_version: firstOsVersion, // Same as session_start
      browser: firstBrowser, // Same as session_start
      browser_version: firstBrowserVersion, // Same as session_start
      device: firstDevice, // Same as session_start
      brand: firstBrand, // Same as session_start
      model: firstModel, // Same as session_start
      imported_at: new Date().toISOString(),
      sdk_name: 'import-session-reconstruction',
      sdk_version: '1.0.0',
    });
  }

  // Insert session events into imports table
  if (sessionEvents.length > 0) {
    await insertImportBatch(sessionEvents, importId);
  }
}

/**
 * Migrate all events from imports table to production events table
 * This includes both original events and generated session events
 */
export async function moveImportsToProduction(
  importId: string,
  from: string,
): Promise<void> {
  // Build the WHERE clause for migration
  // For session events (session_start/session_end), we don't filter by their created_at
  // because they're created with adjusted timestamps (±1 second) that might fall outside
  // the date range. Instead, we include them if their session_id has events in this range.
  let whereClause = 'import_id = {importId:String}';

  if (from) {
    whereClause += ` AND (
      (toDate(created_at) = {from:String}) OR
      (
        name IN ('session_start', 'session_end') AND
        session_id IN (
          SELECT DISTINCT session_id 
          FROM ${TABLE_NAMES.events_imports}
          WHERE import_id = {importId:String}
            AND toDate(created_at) = {from:String} 
            AND name NOT IN ('session_start', 'session_end')
        )
      )
    )`;
  }

  const migrationQuery = `
    INSERT INTO ${TABLE_NAMES.events} (
      id,
      name,
      sdk_name,
      sdk_version,
      device_id,
      profile_id,
      project_id,
      session_id,
      path,
      origin,
      referrer,
      referrer_name,
      referrer_type,
      duration,
      properties,
      created_at,
      country,
      city,
      region,
      longitude,
      latitude,
      os,
      os_version,
      browser,
      browser_version,
      device,
      brand,
      model,
      imported_at
    )
    SELECT 
      id,
      name,
      sdk_name,
      sdk_version,
      device_id,
      profile_id,
      project_id,
      session_id,
      path,
      origin,
      referrer,
      referrer_name,
      referrer_type,
      duration,
      properties,
      created_at,
      country,
      city,
      region,
      longitude,
      latitude,
      os,
      os_version,
      browser,
      browser_version,
      device,
      brand,
      model,
      imported_at
    FROM ${TABLE_NAMES.events_imports}
    WHERE ${whereClause}
    ORDER BY created_at ASC
  `;

  await ch.command({
    query: migrationQuery,
    query_params: { importId, from },
    clickhouse_settings: {
      wait_end_of_query: 1,
      // Ask ClickHouse to periodically send query execution progress in HTTP headers, creating some activity in the connection.
      send_progress_in_http_headers: 1,
      // The interval of sending these progress headers. Here it is less than 60s,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

export async function backfillSessionsToProduction(
  importId: string,
  from: string,
): Promise<void> {
  // After migrating events, populate the sessions table based on the migrated sessions
  // We detect all session_ids involved in this import from the imports table,
  // then aggregate over the production events to construct session rows.
  const sessionsInsertQuery = `
    INSERT INTO ${TABLE_NAMES.sessions} (
      id,
      project_id,
      profile_id,
      device_id,
      created_at,
      ended_at,
      is_bounce,
      entry_origin,
      entry_path,
      exit_origin,
      exit_path,
      screen_view_count,
      revenue,
      event_count,
      duration,
      country,
      region,
      city,
      longitude,
      latitude,
      device,
      brand,
      model,
      browser,
      browser_version,
      os,
      os_version,
      sign,
      version,
      properties
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
        if(countIf(e.name = 'screen_view') > 1, true, false),
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
      argMinIf(e.properties, e.created_at, e.name = 'session_start') as properties
    FROM ${TABLE_NAMES.events_imports} e
    WHERE 
      e.import_id = ${sqlstring.escape(importId)}
      AND toDate(e.created_at) >= ${sqlstring.escape(from)}
      AND e.session_id != ''
    GROUP BY e.session_id
  `;

  await ch.command({
    query: sessionsInsertQuery,
    clickhouse_settings: {
      wait_end_of_query: 1,
      // Ask ClickHouse to periodically send query execution progress in HTTP headers, creating some activity in the connection.
      send_progress_in_http_headers: 1,
      // The interval of sending these progress headers. Here it is less than 60s,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Mark import as complete by updating status
 */
export async function markImportComplete(importId: string): Promise<void> {
  const updateQuery = `
    ALTER TABLE ${TABLE_NAMES.events_imports} 
    UPDATE import_status = 'processed'
    WHERE import_id = {importId:String}
  `;

  await ch.command({
    query: updateQuery,
    query_params: { importId },
    clickhouse_settings: {
      wait_end_of_query: 1,
      mutations_sync: '2', // Wait for mutation to complete
      // Ask ClickHouse to periodically send query execution progress in HTTP headers, creating some activity in the connection.
      send_progress_in_http_headers: 1,
      // The interval of sending these progress headers. Here it is less than 60s,
      http_headers_progress_interval_ms: '50000',
    },
  });
}

/**
 * Get import progress and status
 */
export async function getImportProgress(
  importId: string,
): Promise<ImportProgress> {
  const progressQuery = `
    SELECT 
      import_id,
      COUNT(*) as total_events,
      COUNTIf(import_status = 'pending') as pending_events,
      COUNTIf(import_status = 'processed') as processed_events,
      any(import_status) as status
    FROM ${TABLE_NAMES.events_imports}
    WHERE import_id = {importId:String} 
    AND name NOT IN ('session_start', 'session_end')
    GROUP BY import_id
  `;

  const result = await ch.query({
    query: progressQuery,
    query_params: { importId },
    format: 'JSONEachRow',
  });

  const data = (await result.json()) as Array<{
    import_id: string;
    total_events: number;
    pending_events: number;
    processed_events: number;
    status: string;
  }>;

  if (data.length === 0) {
    return {
      importId,
      totalEvents: 0,
      insertedEvents: 0,
      status: 'pending',
    };
  }

  const row = data[0];
  if (!row) {
    return {
      importId,
      totalEvents: 0,
      insertedEvents: 0,
      status: 'pending',
    };
  }

  return {
    importId,
    totalEvents: row.total_events,
    insertedEvents: row.processed_events,
    status: row.status as 'pending' | 'processing' | 'processed' | 'failed',
  };
}

/**
 * Utility: get min/max created_at for an import
 */
export async function getImportDateBounds(
  importId: string,
  fromCreatedAt?: string,
): Promise<{ min: string | null; max: string | null }> {
  const res = await ch.query({
    query: `
      SELECT min(created_at) AS min, max(created_at) AS max
      FROM ${TABLE_NAMES.events_imports}
      WHERE import_id = {importId:String}
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
 * Unified method to update all import status information
 * Combines step, batch, progress, and status message updates
 */
export type UpdateImportStatusOptions =
  | {
      step: 'loading';
      batch?: string;
      totalEvents?: number;
      processedEvents?: number;
    }
  | {
      step: 'generating_session_ids';
      batch?: string;
    }
  | {
      step: 'creating_sessions';
      batch?: string;
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
  options: UpdateImportStatusOptions,
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
    case 'generating_session_ids':
      data.currentStep = 'generating_session_ids';
      data.currentBatch = options.batch;
      data.statusMessage = options.batch
        ? `Generating session IDs for ${options.batch}`
        : 'Generating session IDs...';
      break;
    case 'creating_sessions':
      data.currentStep = 'creating_sessions';
      data.currentBatch = options.batch;
      data.statusMessage = `Creating sessions for ${options.batch}`;
      break;
    case 'moving':
      data.currentStep = 'moving';
      data.currentBatch = options.batch;
      data.statusMessage = `Moving imports to production for ${options.batch}`;
      break;
    case 'backfilling_sessions':
      data.currentStep = 'backfilling_sessions';
      data.currentBatch = options.batch;
      data.statusMessage = `Backfilling sessions for ${options.batch}`;
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
  }

  jobLogger.info('Import status update', data);

  await job.updateProgress(data);

  await db.import.update({
    where: { id: importId },
    data,
  });
}
