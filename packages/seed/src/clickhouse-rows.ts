// The rows the seed inserts. Copied from core's `IClickhouseEvent`,
// `IClickhouseSession` and `IClickhouseProfile` rather than imported: like
// code-migrations, the seed is a script with direct database access and
// stays out of the backend's dependency graph. `clickhouse-rows.test.ts`
// checks these shapes against the schema.

export interface ClickhouseEventRow {
  id: string;
  name: string;
  device_id: string;
  profile_id: string;
  project_id: string;
  session_id: string;
  path: string;
  origin: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  duration: number;
  properties: Record<string, string>;
  created_at: string;
  country: string;
  city: string;
  region: string;
  longitude: number | null;
  latitude: number | null;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  imported_at: string | null;
  inserted_at: string;
  sdk_name: string;
  sdk_version: string;
  revenue?: number;
  groups: string[];
}

export interface ClickhouseSessionRow {
  id: string;
  profile_id: string;
  event_count: number;
  screen_view_count: number;
  entry_path: string;
  entry_origin: string;
  exit_path: string;
  exit_origin: string;
  created_at: string;
  ended_at: string;
  referrer: string;
  referrer_name: string;
  referrer_type: string;
  os: string;
  os_version: string;
  browser: string;
  browser_version: string;
  device: string;
  brand: string;
  model: string;
  country: string;
  region: string;
  city: string;
  longitude: number | null;
  latitude: number | null;
  is_bounce: boolean;
  project_id: string;
  device_id: string;
  duration: number;
  utm_medium: string;
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  revenue: number;
  sign: 1 | -1;
  version: number;
  groups: string[];
}

export interface ClickhouseProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar: string;
  properties: Record<string, string>;
  project_id: string;
  is_external: boolean;
  created_at: string;
  last_seen_at: string;
  groups: string[];
}

/** `DateTime64(3)` in UTC, the format the worker writes: `yyyy-MM-dd HH:mm:ss.SSS`. */
export function toClickhouseDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}
