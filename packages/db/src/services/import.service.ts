import {
  TABLE_NAMES,
  ch,
  convertClickhouseDateToJs,
  formatClickhouseDate,
} from '../clickhouse/client';
import { db } from '../prisma-client';
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
 * Reconstruct sessions using SQL-based logic
 * This identifies session boundaries and creates session_start/session_end events
 * session_start inherits all properties from the first event in the session
 * session_end inherits all properties from the last event in the session and calculates duration
 */
export async function reconstructSessions(
  importId: string,
  from?: string,
  to?: string,
): Promise<void> {
  // First, let's identify session boundaries and get first/last events for each session
  const rangeWhere = [
    'import_id = {importId:String}',
    "import_status = 'pending'",
    from ? 'created_at >= {from:String}' : '',
    to ? 'created_at < {to:String}' : '',
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
    GROUP BY device_id, session_id, project_id, profile_id
  `;

  const sessionEventsResult = await ch.query({
    query: sessionEventsQuery,
    query_params: { importId, from, to },
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
export async function migrateImportToProduction(
  importId: string,
  from?: string,
  to?: string,
): Promise<void> {
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
    WHERE import_id = {importId:String}
    ${from ? 'AND created_at >= {from:String}' : ''}
    ${to ? 'AND created_at < {to:String}' : ''}
    ORDER BY created_at ASC
  `;

  await ch.command({
    query: migrationQuery,
    query_params: { importId, from, to },
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
  });

  // Also update Postgres

  await db.import.update({
    where: { id: importId },
    data: {
      status: 'completed',
      completedAt: new Date(),
    },
  });
}

/**
 * Update import progress in Postgres
 */
export async function updateImportProgress(
  importId: string,
  totalEvents: number,
  processedEvents: number,
): Promise<void> {
  await db.import.update({
    where: { id: importId },
    data: {
      totalEvents,
      processedEvents,
      status: 'processing',
    },
  });
}

/**
 * Mark import as failed
 */
export async function markImportFailed(
  importId: string,
  errorMessage?: string,
): Promise<void> {
  const updateQuery = `
    ALTER TABLE ${TABLE_NAMES.events_imports} 
    UPDATE import_status = 'failed'
    WHERE import_id = {importId:String}
  `;

  await ch.command({
    query: updateQuery,
    query_params: { importId },
  });

  // Also update Postgres

  await db.import.update({
    where: { id: importId },
    data: {
      status: 'failed',
      errorMessage: errorMessage || 'Import failed',
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
 * Clean up failed imports (optional utility)
 */
export async function cleanupFailedImport(importId: string): Promise<void> {
  const deleteQuery = `
    DELETE FROM ${TABLE_NAMES.events_imports}
    WHERE import_id = {importId:String} AND import_status = 'failed'
  `;

  await ch.command({
    query: deleteQuery,
    query_params: { importId },
  });
}

/**
 * Utility: get min/max created_at for an import
 */
export async function getImportDateBounds(
  importId: string,
): Promise<{ min: string | null; max: string | null }> {
  const res = await ch.query({
    query: `
      SELECT min(created_at) AS min, max(created_at) AS max
      FROM ${TABLE_NAMES.events_imports}
      WHERE import_id = {importId:String}
    `,
    query_params: { importId },
    format: 'JSONEachRow',
  });
  const rows = (await res.json()) as Array<{
    min: string | null;
    max: string | null;
  }>;
  return rows[0] ?? { min: null, max: null };
}
