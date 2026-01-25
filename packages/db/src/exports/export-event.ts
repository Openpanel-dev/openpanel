import { convertClickhouseDateToJs } from '../clickhouse/client';
import type { IClickhouseEvent } from '../services/event.service';

/**
 * Stable, versioned export schema written to the object store (JSONL/Parquet).
 * Decoupled from the ClickHouse row shape so the export format can evolve
 * independently of the internal column layout.
 */
export interface IExportEvent {
  event_id: string;
  project_id: string;
  event_name: string;
  event_time: string; // ISO 8601 (the event's created_at)
  user_id: string | null;
  session_id: string | null;
  device_id: string | null;
  properties: Record<string, unknown>;
  // Geo data
  country: string | null;
  city: string | null;
  region: string | null;
  // Device data
  os: string | null;
  browser: string | null;
  device: string | null;
  // Page data
  path: string | null;
  origin: string | null;
  referrer: string | null;
  // Metadata
  ingested_at: string; // ISO 8601 (ClickHouse inserted_at)
  schema_version: number;
}

export const EXPORT_SCHEMA_VERSION = 1;

const toIso = (chDate: string): string =>
  convertClickhouseDateToJs(chDate).toISOString();

/**
 * Map a ClickHouse event row to the stable export schema.
 */
export function clickhouseEventToExportEvent(
  event: IClickhouseEvent,
): IExportEvent {
  return {
    event_id: event.id,
    project_id: event.project_id,
    event_name: event.name,
    event_time: toIso(event.created_at),
    // device_id doubles as the anonymous profile id; only surface a real,
    // external user id.
    user_id:
      event.profile_id && event.profile_id !== event.device_id
        ? event.profile_id
        : null,
    session_id: event.session_id || null,
    device_id: event.device_id || null,
    properties: event.properties ?? {},
    country: event.country || null,
    city: event.city || null,
    region: event.region || null,
    os: event.os || null,
    browser: event.browser || null,
    device: event.device || null,
    path: event.path || null,
    origin: event.origin || null,
    referrer: event.referrer || null,
    ingested_at: toIso(event.inserted_at || event.created_at),
    schema_version: EXPORT_SCHEMA_VERSION,
  };
}
