/**
 * Column sets for the raw event/session rows returned by several tools.
 *
 * A ClickHouse event carries 31 fields and a session 35. Most are dead weight
 * to a reader: `project_id` is constant for the whole call, and `longitude`/
 * `latitude`/`imported_at`/`sdk_*`/`*_version`/`brand`/`model`/`device_id`
 * answer questions nobody asks of a 20-row sample. Tools return the useful
 * subset by default and let the caller opt into the rest via a `fields`
 * argument, rather than paying for every field on every call.
 */

export const EVENT_COLUMNS_DEFAULT = [
  'created_at',
  'name',
  'path',
  'profile_id',
  'session_id',
  'country',
  'device',
  'browser',
  'os',
  'referrer_name',
  'referrer_type',
  'duration',
  'revenue',
  'properties',
] as const;

export const EVENT_COLUMNS_EXTRA = [
  'id',
  'origin',
  'referrer',
  'city',
  'region',
  'os_version',
  'browser_version',
  'brand',
  'model',
  'device_id',
  'sdk_name',
  'sdk_version',
  'groups',
] as const;

export const SESSION_COLUMNS_DEFAULT = [
  'id',
  'created_at',
  'duration',
  'event_count',
  'screen_view_count',
  'is_bounce',
  'entry_path',
  'exit_path',
  'profile_id',
  'country',
  'device',
  'browser',
  'referrer_name',
  'referrer_type',
  'revenue',
] as const;

export const SESSION_COLUMNS_EXTRA = [
  'ended_at',
  'entry_origin',
  'exit_origin',
  'referrer',
  'city',
  'region',
  'os',
  'os_version',
  'browser_version',
  'brand',
  'model',
  'device_id',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;
