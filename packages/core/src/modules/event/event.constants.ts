// Isomorphic vocabulary for the event module (ADR-022 R8). These are column
// whitelists, not query logic — moved here from event.service.ts / src/sql.ts
// so a value-import (mcp's property-values tool today; a future dashboard
// form tomorrow) has a `*.constants.ts` to reach instead of a service or
// query-builder file.

/**
 * Top-level filterable columns on the `events` table. These apply to
 * every event regardless of name and can be passed straight to
 * `getEventFiltersWhereClause` as filter / breakdown `name` values.
 *
 * Kept as a whitelist because the filter builder splices `name` into
 * SQL verbatim — only these are safe to expose through the AI /
 * MCP discovery surface.
 */
export const EVENT_COLUMNS = [
  'path',
  'origin',
  'referrer',
  'referrer_name',
  'referrer_type',
  'duration',
  'country',
  'city',
  'region',
  'os',
  'os_version',
  'browser',
  'browser_version',
  'device',
  'brand',
  'model',
  'sdk_name',
  'sdk_version',
  'profile_id',
  'session_id',
  'device_id',
  'revenue',
] as const;

export type IEventColumn = (typeof EVENT_COLUMNS)[number];

/** Every column `getEventList` can project, in V1's select order. */
export const EVENT_LIST_COLUMNS = [
  'created_at',
  'project_id',
  'id',
  'name',
  'device_id',
  'profile_id',
  'session_id',
  'properties',
  'country',
  'city',
  'region',
  'longitude',
  'latitude',
  'os',
  'os_version',
  'browser',
  'browser_version',
  'device',
  'brand',
  'model',
  'path',
  'origin',
  'referrer',
  'referrer_name',
  'referrer_type',
  'imported_at',
  'sdk_name',
  'sdk_version',
  'revenue',
  'groups',
] as const;

export type EventListColumn = (typeof EVENT_LIST_COLUMNS)[number];

/** The `= value` columns `queryEventsCore` accepts, in V1's clause order. */
export const QUERY_EVENTS_EQUALITY_COLUMNS = [
  'path',
  'referrer',
  'referrer_name',
  'referrer_type',
  'device',
  'country',
  'city',
  'os',
  'browser',
] as const;

export type QueryEventsEqualityColumn =
  (typeof QUERY_EVENTS_EQUALITY_COLUMNS)[number];
