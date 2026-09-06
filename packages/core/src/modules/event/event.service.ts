// Ported from packages/db/src/services/event.service.ts and the query bodies
// of packages/trpc/src/routers/event.ts (M7-002). The db file is now a
// re-export shim over this one, so @openpanel/db importers (packages/trpc,
// apps/api's export controller and bot hook, the buffers' types,
// notification.service, the mcp/assistant tools) keep working while V1 runs
// (DELEGATE PATTERN).
//
// Every query is a `sql` fragment (src/event.sql.ts), converted one at a time
// with a result-set proof each, per ADR-013. The two filter compilers
// (`getEventFiltersWhereClause`, `buildFilterWhere`) are NOT converted here —
// they are shared and out of this task's scope; src/filter-clauses.ts is the
// one bridge.
//
// Not ported: V1's `EventService.query` / `EventService.getList` (a clix
// builder over events + profiles + sessions) — nothing in the repo calls
// them; `eventService.getById` is `getEventById` below. `GetEventListOptions.
// custom(sb)` — its only caller (event.conversions) is the typed
// `conversionNames` option instead, since there is no builder to hand out.
//
// M10-005: every function that touches a database takes `ServiceDeps` and
// reaches Postgres as `deps.db`, ClickHouse as `deps.ch` (through
// shared/ch-query.ts) and the event/bot buffers as `deps.buffers.*`. The
// `loadDb` / `loadChClient` / `loadDbBuffers` lazy loaders are gone, and so
// are the two `import('@openpanel/core')` self-barrel hops this file made for
// `resolveMaxLookbackDays` / `resolveDateRange` — both are imported straight
// from `shared/` (docs/TECH_DEBT.md §2, §4). What stays lazy is named and
// argued at each remaining `load*` below; none of them reach @openpanel/db.

import { DateTime, toDots } from '@openpanel/common';
import type { SqlFragment } from '@openpanel/db/src/clickhouse/sql';
import type { EventMeta, Prisma } from '@openpanel/db/src/prisma-client';
import type { IChartEventFilter } from '@openpanel/validation';
import { clone, mergeDeepRight, uniq } from 'ramda';
import type { ServiceDeps } from '../../services';
import { cacheablePerDeps } from '../../shared/cacheable-per-deps';
import { chQuery } from '../../shared/ch-query';
import { resolveDateRange } from '../../shared/date';
import { resolveMaxLookbackDays } from '../../shared/lookback';
import { getEventFiltersWhereClause } from '../chart/src/filter-where';
import {
  getProfileById,
  getProfilesCached,
  type IServiceProfile,
  type IServiceUpsertProfile,
  upsertProfile,
} from '../profile/profile.service';
import type { IClickhouseSession } from '../session/session.service';
import { convertClickhouseDateToJs, formatClickhouseDate } from './src/dates';
import {
  botEventsCountQuery,
  botEventsQuery,
  type EventFilterJoins,
  type EventListColumn,
  type EventListQuery,
  type EventsCountQuery,
  eventByIdQuery,
  eventListQuery,
  eventPropertiesQuery,
  eventPropertyValuesQuery,
  eventsCountQuery,
  NO_FILTER_JOINS,
  type QueryEventsEqualityColumn,
  queryEventsQuery,
  topEventNamesQuery,
  topOriginsQuery,
  topPagesQuery,
} from './src/event.sql';
import type { CompiledFilterClauses } from './src/filter-clauses';

export {
  EVENT_LIST_COLUMNS,
  QUERY_EVENTS_EQUALITY_COLUMNS,
} from './src/event.sql';

const EVENT_METAS_CACHE_SECONDS = 60 * 5;
// V1's `cacheable(getEventMetas, ...)` derived this from the function's own
// name; naming it keeps the Redis key `cachable:getEventMetas:<projectId>`.
const EVENT_METAS_CACHE_NAME = 'getEventMetas';
const TOP_EVENT_NAMES_CACHE_SECONDS = 60 * 10;
const EVENT_LIST_DEFAULT_LOOKBACK_DAYS = 0.5;
const EVENT_LIST_MAX_LOOKBACK_DAYS_DEFAULT = 365 * 5;
const EVENT_LIST_MAX_LOOKBACK_DAYS_ENV = 'EVENT_LIST_MAX_LOOKBACK_DAYS';
const QUERY_EVENTS_DEFAULT_LIMIT = 20;
const CLICKHOUSE_DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss.SSS';
const MASK_CHARACTER = '*';
const MASK_VISIBLE_PREFIX = 4;
const MASK_MIN_LENGTH_FOR_PREFIX = 8;
const MASKABLE_CHARACTERS = /(\w)/g;
const EVENTS_ALIAS = 'e';
const PROFILE_FILTER_PREFIX = 'profile.';
const GROUP_FILTER_PREFIX = 'group.';
const LOCALHOST_ORIGIN_MARKER = 'localhost:';

// clix always sent `session_timezone: 'UTC'`; the queries converted from clix
// keep sending it so their result sets stay identical.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

const QUERY_EVENTS_FILTER_TARGET = {
  selfTable: 'events',
  profileIdExpr: 'profile_id',
  groupsExpr: 'groups',
} as const;

// Lazy for the same reason subscription.service.ts's is: core tests that
// partially mock `@openpanel/redis` (no `getCache`) reach this module through
// the core barrel.
function loadCache() {
  return import('@openpanel/redis').then((m) => m.getCache);
}

function loadFilterCompiler() {
  return import('../chart/src/table-filter-where');
}

// Lazy: session.service → session-end → this module is a static chain, and a
// static edge back would be a plain import cycle evaluated in the wrong order.
// Keep this the ONLY dynamic edge on that loop — a second one (e.g. session-end
// lazily importing this module) panics rolldown when apps/worker bundles the
// workspace (module_finalizers "no entry found for key").
function loadSessionService() {
  return import('../session/session.service');
}

export type IImportedEvent = Omit<
  IClickhouseEvent,
  'properties' | 'profile' | 'meta' | 'imported_at'
> & {
  properties: Record<string, unknown>;
};

export interface IServicePage {
  path: string;
  count: number;
  project_id: string;
  first_seen: string;
  title: string;
  origin: string;
}

export interface IClickhouseBotEvent {
  id: string;
  name: string;
  type: string;
  project_id: string;
  path: string;
  created_at: string;
}

export interface IServiceBotEvent {
  id: string;
  name: string;
  type: string;
  projectId: string;
  path: string;
  createdAt: Date;
}

export type IServiceCreateBotEventPayload = Omit<IServiceBotEvent, 'id'>;

export interface IClickhouseEvent {
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
  properties: Record<string, string | number | boolean | undefined | null>;
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
  // Ingestion (ClickHouse-insert) time. Set explicitly at insert time; the
  // column DEFAULTs to created_at for rows that omit it. Used as the cursor for
  // object-store exports. Optional here because most read queries don't select
  // it.
  inserted_at?: string;
  sdk_name: string;
  sdk_version: string;
  revenue?: number;
  groups: string[];

  // They do not exist here. Just make ts happy for now
  profile?: IServiceProfile;
  meta?: EventMeta;
}

export interface IServiceEvent {
  id: string;
  name: string;
  deviceId: string;
  profileId: string;
  projectId: string;
  sessionId: string;
  properties: Record<string, unknown> & {
    hash?: string;
    query?: Record<string, unknown>;
  };
  createdAt: Date;
  country?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  longitude?: number | undefined | null;
  latitude?: number | undefined | null;
  os?: string | undefined;
  osVersion?: string | undefined;
  browser?: string | undefined;
  browserVersion?: string | undefined;
  device?: string | undefined;
  brand?: string | undefined;
  model?: string | undefined;
  duration?: number;
  path: string;
  origin: string;
  referrer: string | undefined;
  referrerName: string | undefined;
  referrerType: string | undefined;
  importedAt: Date | undefined;
  profile: IServiceProfile | undefined;
  meta: EventMeta | undefined;
  sdkName: string | undefined;
  sdkVersion: string | undefined;
  revenue?: number;
  groups: string[];
}

export type IServiceCreateEventPayload = Omit<
  IServiceEvent,
  'id' | 'importedAt' | 'profile' | 'meta'
>;
/**
 * A create payload whose id was already minted upstream (the ingest producer).
 * Reusing it means a redelivered Kafka message lands as an identical-id row.
 */
export type IServiceCreateEventPayloadWithId = IServiceCreateEventPayload & {
  id?: string;
};
export type IServiceImportedEventPayload = Omit<
  IServiceEvent,
  'profile' | 'meta'
>;

export interface IServiceEventMinimal {
  id: string;
  name: string;
  projectId: string;
  sessionId: string;
  createdAt: Date;
  country?: string | undefined;
  longitude?: number | undefined | null;
  latitude?: number | undefined | null;
  os?: string | undefined;
  browser?: string | undefined;
  device?: string | undefined;
  brand?: string | undefined;
  duration?: number;
  path: string;
  origin: string;
  referrer: string | undefined;
  meta: EventMeta | undefined;
  minimal: boolean;
}

type SelectHelper<T> = {
  [K in keyof T]?: boolean;
};

export type EventListSelect = SelectHelper<IServiceEvent>;

interface GetEventsOptions {
  profile?: boolean;
  meta?: boolean | Prisma.EventMetaSelect;
}

export function transformSessionToEvent(
  session: IClickhouseSession
): IServiceEvent {
  return {
    id: '', // Not used
    name: 'screen_view',
    sessionId: session.id,
    profileId: session.profile_id,
    path: session.exit_path,
    origin: session.exit_origin,
    createdAt: convertClickhouseDateToJs(session.ended_at),
    referrer: session.referrer,
    referrerName: session.referrer_name,
    referrerType: session.referrer_type,
    os: session.os,
    osVersion: session.os_version,
    browser: session.browser,
    browserVersion: session.browser_version,
    device: session.device,
    brand: session.brand,
    model: session.model,
    country: session.country,
    region: session.region,
    city: session.city,
    longitude: session.longitude,
    latitude: session.latitude,
    projectId: session.project_id,
    deviceId: session.device_id,
    duration: 0,
    revenue: session.revenue,
    properties: {
      is_bounce: session.is_bounce,
      __query: {
        utm_medium: session.utm_medium,
        utm_source: session.utm_source,
        utm_campaign: session.utm_campaign,
        utm_content: session.utm_content,
        utm_term: session.utm_term,
      },
    },
    profile: undefined,
    meta: undefined,
    importedAt: undefined,
    sdkName: undefined,
    sdkVersion: undefined,
    groups: [],
  };
}

export function transformEvent(event: IClickhouseEvent): IServiceEvent {
  return {
    id: event.id,
    name: event.name,
    deviceId: event.device_id,
    profileId: event.profile_id,
    projectId: event.project_id,
    sessionId: event.session_id,
    properties: event.properties,
    createdAt: convertClickhouseDateToJs(event.created_at),
    country: event.country,
    city: event.city,
    region: event.region,
    longitude: event.longitude,
    latitude: event.latitude,
    os: event.os,
    osVersion: event.os_version,
    browser: event.browser,
    browserVersion: event.browser_version,
    device: event.device,
    brand: event.brand,
    model: event.model,
    path: event.path,
    origin: event.origin,
    referrer: event.referrer,
    referrerName: event.referrer_name,
    referrerType: event.referrer_type,
    meta: event.meta,
    importedAt: event.imported_at ? new Date(event.imported_at) : undefined,
    sdkName: event.sdk_name,
    sdkVersion: event.sdk_version,
    profile: event.profile,
    revenue: event.revenue,
    groups: event.groups ?? [],
  };
}

function maskString(str: string, mask = MASK_CHARACTER) {
  const allMasked = str.replace(MASKABLE_CHARACTERS, mask);
  if (str.length < MASK_MIN_LENGTH_FOR_PREFIX) {
    return allMasked;
  }

  return `${str.slice(0, MASK_VISIBLE_PREFIX)}${allMasked.slice(MASK_VISIBLE_PREFIX)}`;
}

export function transformMinimalEvent(
  event: IServiceEvent
): IServiceEventMinimal {
  return {
    id: event.id,
    name: event.name,
    projectId: event.projectId,
    sessionId: event.sessionId,
    createdAt: event.createdAt,
    country: event.country,
    longitude: event.longitude,
    latitude: event.latitude,
    os: event.os,
    browser: event.browser,
    device: event.device,
    brand: event.brand,
    duration: event.duration,
    path: maskString(event.path),
    origin: event.origin,
    referrer: event.referrer,
    meta: event.meta,
    minimal: true,
  };
}

export async function getEventMetas(deps: ServiceDeps, projectId: string) {
  return deps.db.eventMeta.findMany({
    where: {
      projectId,
    },
  });
}

export const getEventMetasCached = cacheablePerDeps(
  EVENT_METAS_CACHE_NAME,
  getEventMetas,
  EVENT_METAS_CACHE_SECONDS
);

function emptyProfile(profileId: string, projectId: string): IServiceProfile {
  return {
    id: profileId,
    email: '',
    avatar: '',
    firstName: '',
    lastName: '',
    createdAt: new Date(),
    lastSeenAt: new Date(),
    projectId,
    isExternal: false,
    properties: {},
    groups: [],
  };
}

async function attachProfiles(
  deps: ServiceDeps,
  events: IClickhouseEvent[],
  projectId: string
) {
  const ids = events
    .filter((e) => e.device_id !== e.profile_id)
    .map((e) => e.profile_id);
  const profiles = await getProfilesCached(deps, ids, projectId);

  const map = new Map<string, IServiceProfile>();
  for (const profile of profiles) {
    map.set(profile.id, profile);
  }

  for (const event of events) {
    event.profile =
      map.get(event.profile_id) ?? emptyProfile(event.profile_id, projectId);
  }
}

async function attachMetas(
  deps: ServiceDeps,
  events: IClickhouseEvent[],
  projectId: string
) {
  const metas = await getEventMetasCached(deps, projectId);
  const map = new Map<string, EventMeta>();
  for (const meta of metas) {
    map.set(meta.name, meta);
  }
  for (const event of events) {
    event.meta = map.get(event.name);
  }
}

export async function getEvents(
  deps: ServiceDeps,
  query: SqlFragment,
  options: GetEventsOptions = {}
): Promise<IServiceEvent[]> {
  const events = await chQuery<IClickhouseEvent>(deps, query);
  const projectId = events[0]?.project_id;
  if (options.profile && projectId) {
    await attachProfiles(deps, events, projectId);
  }
  if (options.meta && projectId) {
    await attachMetas(deps, events, projectId);
  }
  return events.map(transformEvent);
}

/**
 * Persist an event to ClickHouse (via the buffer) and upsert the profile
 * on session boundaries.
 *
 * Does NOT touch the session-row buffer. Callers producing non-session_start
 * / session_end events are responsible for calling `sessionBuffer.ingest()`
 * before this. `incoming-event.ts` is the only such caller today; everywhere
 * else (session_start, session_end) the session-row update is correctly a
 * no-op anyway.
 */
export async function createEvent(
  deps: ServiceDeps,
  payload: IServiceCreateEventPayloadWithId
) {
  if (!payload.profileId && payload.deviceId) {
    payload.profileId = payload.deviceId;
  }

  const event: IClickhouseEvent = {
    id: payload.id ?? crypto.randomUUID(),
    name: payload.name,
    device_id: payload.deviceId,
    profile_id: payload.profileId ? String(payload.profileId) : '',
    project_id: payload.projectId,
    session_id: payload.sessionId,
    properties: toDots(payload.properties),
    path: payload.path ?? '',
    origin: payload.origin ?? '',
    created_at: DateTime.fromJSDate(payload.createdAt)
      .setZone('UTC')
      .toFormat(CLICKHOUSE_DATETIME_FORMAT),
    country: payload.country ?? '',
    city: payload.city ?? '',
    region: payload.region ?? '',
    longitude: payload.longitude ?? null,
    latitude: payload.latitude ?? null,
    os: payload.os ?? '',
    os_version: payload.osVersion ?? '',
    browser: payload.browser ?? '',
    browser_version: payload.browserVersion ?? '',
    device: payload.device ?? '',
    brand: payload.brand ?? '',
    model: payload.model ?? '',
    duration: payload.duration ?? 0,
    referrer: payload.referrer ?? '',
    referrer_name: payload.referrerName ?? '',
    referrer_type: payload.referrerType ?? '',
    imported_at: null,
    // Ingestion time, used as the export cursor. Stamped here rather than via the
    // column DEFAULT so backdated events (server-side, offline, past timestamps)
    // still get a real, monotonic-ish insert time instead of their event time.
    inserted_at: DateTime.utc().toFormat(CLICKHOUSE_DATETIME_FORMAT),
    sdk_name: payload.sdkName ?? '',
    sdk_version: payload.sdkVersion ?? '',
    revenue: payload.revenue,
    groups: payload.groups ?? [],
  };

  deps.buffers.event.add(event);

  const promises: Promise<unknown>[] = [];

  if (payload.profileId) {
    const profile: IServiceUpsertProfile = {
      id: String(payload.profileId),
      isExternal: payload.profileId !== payload.deviceId,
      projectId: payload.projectId,
      properties: {
        path: payload.path,
        country: payload.country,
        city: payload.city,
        region: payload.region,
        longitude: payload.longitude,
        latitude: payload.latitude,
        os: payload.os,
        os_version: payload.osVersion,
        browser: payload.browser,
        browser_version: payload.browserVersion,
        device: payload.device,
        brand: payload.brand,
        model: payload.model,
        referrer: payload.referrer,
        referrer_name: payload.referrerName,
        referrer_type: payload.referrerType,
      },
    };

    // Only upsert the profile on session boundaries.
    // - session_start covers fresh activity.
    // - session_end is synthesized server-side by the worker.
    // Identified users' explicit profile writes (op.identify(), op.setProfile())
    // go through the controller path and are not affected by this branch.
    //
    // `isFromEvent=true` activates profile-buffer's cache shortcut: if the
    // profile is in the 1h Redis cache (i.e. recently flushed), the add is
    // skipped. Trade-off: profile.last_seen_at granularity is capped at the
    // cache TTL (~1h) rather than per-session. We accept this because
    // (a) profile-buffer was the leading indicator in the 2026-05-20 buildup
    //     and was processing ~2 writes per session per anonymous user;
    // (b) the bulk of those writes carried no new information (anonymous
    //     profile data is event-derived and stable across a session);
    // (c) recency queries should derive from event timestamps, not from
    //     profile.last_seen_at.
    if (payload.name === 'session_start' || payload.name === 'session_end') {
      promises.push(upsertProfile(deps, profile, true));
    }
  }

  await Promise.all(promises);

  return {
    document: event,
  };
}

export interface GetEventListOptions {
  projectId: string;
  profileId?: string;
  sessionId?: string;
  groupId?: string;
  cohortId?: string;
  take: number;
  cursor?: number | Date;
  events?: string[] | null;
  filters?: IChartEventFilter[];
  startDate?: Date;
  endDate?: Date;
  select?: EventListSelect;
  /** `event.conversions`' extra `name IN (..)` narrowing. */
  conversionNames?: string[];
  dateIntervalInDays?: number;
}

/** V1's default projection, merged under whatever the caller asks for. */
const DEFAULT_EVENT_LIST_SELECT: EventListSelect = {
  id: true,
  name: true,
  deviceId: true,
  profileId: true,
  sessionId: true,
  projectId: true,
  createdAt: true,
  path: true,
  duration: true,
  city: true,
  country: true,
  os: true,
  browser: true,
};

// V1 emitted these in this order, `created_at` and `project_id` always first.
const SELECT_TO_COLUMN: readonly [keyof EventListSelect, EventListColumn][] = [
  ['id', 'id'],
  ['name', 'name'],
  ['deviceId', 'device_id'],
  ['profileId', 'profile_id'],
  ['sessionId', 'session_id'],
  ['properties', 'properties'],
  ['country', 'country'],
  ['city', 'city'],
  ['region', 'region'],
  ['longitude', 'longitude'],
  ['latitude', 'latitude'],
  ['os', 'os'],
  ['osVersion', 'os_version'],
  ['browser', 'browser'],
  ['browserVersion', 'browser_version'],
  ['device', 'device'],
  ['brand', 'brand'],
  ['model', 'model'],
  ['path', 'path'],
  ['origin', 'origin'],
  ['referrer', 'referrer'],
  ['referrerName', 'referrer_name'],
  ['referrerType', 'referrer_type'],
  ['importedAt', 'imported_at'],
  ['sdkName', 'sdk_name'],
  ['sdkVersion', 'sdk_version'],
  ['revenue', 'revenue'],
  ['groups', 'groups'],
];

function eventListColumns(select: EventListSelect): EventListColumn[] {
  const columns: EventListColumn[] = ['created_at', 'project_id'];
  for (const [key, column] of SELECT_TO_COLUMN) {
    if (select[key]) {
      columns.push(column);
    }
  }
  return columns;
}

/** Which joins the compiled `profile.*` / `group.*` filters will read from. */
function eventFilterJoins(filters: IChartEventFilter[]): EventFilterJoins {
  const profileColumns = uniq(
    filters
      .filter((f) => f.name.startsWith(PROFILE_FILTER_PREFIX))
      .map((f) => f.name.replace(PROFILE_FILTER_PREFIX, '').split('.')[0])
      .filter((column): column is string => column !== undefined)
  );
  const groups = filters.some((f) => f.name.startsWith(GROUP_FILTER_PREFIX));
  return { profileColumns, groups };
}

async function compileEventFilters(
  filters: IChartEventFilter[] | undefined,
  projectId: string
): Promise<{ filterClauses: CompiledFilterClauses; joins: EventFilterJoins }> {
  if (!filters) {
    return { filterClauses: {}, joins: NO_FILTER_JOINS };
  }
  return {
    filterClauses: getEventFiltersWhereClause(filters, projectId, EVENTS_ALIAS),
    joins: eventFilterJoins(filters),
  };
}

/**
 * V1 applied the lookback window for a Date cursor and for "no cursor and no
 * date range" — where a numeric `cursor` of 0 counts as no cursor, so the
 * first numeric page is windowed and later pages are not.
 */
function hasEventListLookback(options: GetEventListOptions): boolean {
  const { cursor, startDate, endDate } = options;
  return cursor instanceof Date || !(cursor || (startDate && endDate));
}

export async function getEventList(
  deps: ServiceDeps,
  options: GetEventListOptions
): Promise<IServiceEvent[]> {
  const {
    cursor,
    take,
    projectId,
    profileId,
    sessionId,
    groupId,
    cohortId,
    events,
    filters,
    startDate,
    endDate,
    conversionNames,
    select: incomingSelect,
    dateIntervalInDays = EVENT_LIST_DEFAULT_LOOKBACK_DAYS,
  } = options;

  // Deployment-tunable ceiling for the empty-result lookback (see lookback.ts).
  const maxLookbackDays = resolveMaxLookbackDays(
    EVENT_LIST_MAX_LOOKBACK_DAYS_ENV,
    EVENT_LIST_MAX_LOOKBACK_DAYS_DEFAULT
  );
  const lookbackDays = Math.min(dateIntervalInDays, maxLookbackDays);
  const hasLookback = hasEventListLookback(options);

  const select = mergeDeepRight(
    DEFAULT_EVENT_LIST_SELECT,
    incomingSelect ?? {}
  ) as EventListSelect;

  const { filterClauses, joins } = await compileEventFilters(
    filters,
    projectId
  );

  const query: EventListQuery = {
    projectId,
    columns: eventListColumns(select),
    take,
    offset: typeof cursor === 'number' ? Math.max(0, cursor * take) : undefined,
    cursor: cursor instanceof Date ? cursor : undefined,
    lookbackDays: hasLookback ? lookbackDays : undefined,
    profileId,
    sessionId,
    groupId,
    cohortId,
    startDate,
    endDate,
    events: events ?? undefined,
    filterClauses,
    joins,
    conversionNames,
  };

  const data = await getEvents(deps, eventListQuery(query), {
    profile: select.profile ?? true,
    meta: select.meta ?? true,
  });

  // If we dont get any events, try without the cursor window
  if (data.length === 0 && hasLookback && lookbackDays < maxLookbackDays) {
    return getEventList(deps, {
      ...options,
      dateIntervalInDays: dateIntervalInDays * 2,
    });
  }

  return data;
}

export async function getEventsCount(
  deps: ServiceDeps,
  {
    projectId,
    profileId,
    groupId,
    cohortId,
    events,
    filters,
    startDate,
    endDate,
  }: Omit<GetEventListOptions, 'cursor' | 'take'>
): Promise<number> {
  const { filterClauses, joins } = await compileEventFilters(
    filters,
    projectId
  );
  const query: EventsCountQuery = {
    projectId,
    profileId,
    groupId,
    cohortId,
    startDate,
    endDate,
    events: events ?? undefined,
    filterClauses,
    joins,
  };
  const res = await chQuery<{ count: number }>(deps, eventsCountQuery(query));
  return res[0]?.count ?? 0;
}

export async function createBotEvent(
  deps: ServiceDeps,
  { name, type, projectId, createdAt, path }: IServiceCreateBotEventPayload
) {
  return deps.buffers.bot.add({
    id: crypto.randomUUID(),
    name,
    type,
    project_id: projectId,
    path,
    created_at: formatClickhouseDate(createdAt),
  });
}

export async function getConversionEventNames(
  deps: ServiceDeps,
  projectId: string
) {
  return deps.db.eventMeta.findMany({
    where: {
      projectId,
      conversion: true,
    },
  });
}

export async function getTopPages(
  deps: ServiceDeps,
  {
    projectId,
    cursor,
    take,
    search,
  }: {
    projectId: string;
    cursor?: number;
    take: number;
    search?: string;
  }
): Promise<IServicePage[]> {
  return chQuery<IServicePage>(
    deps,
    topPagesQuery({
      projectId,
      take,
      offset: Math.max(0, (cursor ?? 0) * take),
      search,
    })
  );
}

/** V1's `eventService.getById`. */
export async function getEventById(
  deps: ServiceDeps,
  {
    projectId,
    id,
    createdAt,
  }: {
    projectId: string;
    id: string;
    createdAt?: Date;
  }
): Promise<IServiceEvent | null> {
  const [rows, metas] = await Promise.all([
    chQuery<IClickhouseEvent>(
      deps,
      eventByIdQuery({ projectId, id, createdAt }),
      CLIX_SESSION_TIMEZONE
    ),
    getEventMetasCached(deps, projectId),
  ]);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const event = transformEvent(row);

  if (event.profileId) {
    const profile = await getProfileById(deps, event.profileId, projectId);
    if (profile) {
      event.profile = profile;
    }
  }

  event.meta = metas.find((meta) => meta.name === event.name);

  return event;
}

export async function getTopEventNames(
  deps: ServiceDeps,
  projectId: string
): Promise<string[]> {
  const getCache = await loadCache();
  return getCache(
    `mcp:event-names:${projectId}`,
    TOP_EVENT_NAMES_CACHE_SECONDS,
    async () => {
      const rows = await chQuery<{ name: string; count: number }>(
        deps,
        topEventNamesQuery(projectId),
        CLIX_SESSION_TIMEZONE
      );
      return rows.map((r) => r.name);
    }
  );
}

export const listEventNamesCore = (
  deps: ServiceDeps,
  projectId: string
): Promise<string[]> => getTopEventNames(deps, projectId);

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

export async function listEventPropertiesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    eventName?: string;
  }
): Promise<{
  columns: readonly string[];
  properties: Array<{ property_key: string; event_name: string }>;
}> {
  const rows = await chQuery<{ property_key: string; event_name: string }>(
    deps,
    eventPropertiesQuery(input),
    CLIX_SESSION_TIMEZONE
  );
  return { columns: EVENT_COLUMNS, properties: rows };
}

export async function getEventPropertyValuesCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    eventName: string;
    propertyKey: string;
  }
): Promise<{ event: string; property: string; values: string[] }> {
  const rows = await chQuery<{ value: string }>(
    deps,
    eventPropertyValuesQuery(input),
    CLIX_SESSION_TIMEZONE
  );

  return {
    event: input.eventName,
    property: input.propertyKey,
    values: rows.map((r) => r.value),
  };
}

export interface QueryEventsInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
  eventNames?: string[];
  path?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  referrer?: string;
  referrerName?: string;
  referrerType?: string;
  sessionId?: string;
  profileId?: string;
  profileIds?: string[];
  properties?: Record<string, string>;
  filters?: IChartEventFilter[];
  limit?: number;
}

const QUERY_EVENTS_INPUT_TO_COLUMN: readonly [
  keyof QueryEventsInput,
  QueryEventsEqualityColumn,
][] = [
  ['path', 'path'],
  ['referrer', 'referrer'],
  ['referrerName', 'referrer_name'],
  ['referrerType', 'referrer_type'],
  ['device', 'device'],
  ['country', 'country'],
  ['city', 'city'],
  ['os', 'os'],
  ['browser', 'browser'],
];

function queryEventsEquals(
  input: QueryEventsInput
): Partial<Record<QueryEventsEqualityColumn, string>> {
  const equals: Partial<Record<QueryEventsEqualityColumn, string>> = {};
  for (const [key, column] of QUERY_EVENTS_INPUT_TO_COLUMN) {
    const value = input[key];
    if (typeof value === 'string' && value) {
      equals[column] = value;
    }
  }
  return equals;
}

// Skip the default 30-day date filter when sessionId is set — a session id
// is unique and narrow enough to query directly. Without this, an older
// session's events would be silently excluded. A caller that still passes
// dates alongside a sessionId is honoured.
function queryEventsDateRange(
  input: QueryEventsInput
): { start: string; end: string } | undefined {
  const wantsRange = !input.sessionId || input.startDate || input.endDate;
  if (!wantsRange) {
    return undefined;
  }
  const { startDate, endDate } = resolveDateRange(
    input.startDate,
    input.endDate
  );
  return {
    start: formatClickhouseDate(new Date(startDate)),
    end: formatClickhouseDate(new Date(endDate)),
  };
}

export async function queryEventsCore(
  deps: ServiceDeps,
  input: QueryEventsInput
): Promise<IClickhouseEvent[]> {
  let filterClauses: CompiledFilterClauses = {};
  if (input.filters?.length) {
    const { buildFilterWhere } = await loadFilterCompiler();
    filterClauses = buildFilterWhere(
      input.filters,
      input.projectId,
      QUERY_EVENTS_FILTER_TARGET
    );
  }
  return chQuery<IClickhouseEvent>(
    deps,
    queryEventsQuery({
      projectId: input.projectId,
      sessionId: input.sessionId,
      profileId: input.profileId,
      profileIds: input.profileIds,
      eventNames: input.eventNames,
      equals: queryEventsEquals(input),
      properties: input.properties,
      dateRange: queryEventsDateRange(input),
      filterClauses,
      limit: input.limit ?? QUERY_EVENTS_DEFAULT_LIMIT,
    }),
    CLIX_SESSION_TIMEZONE
  );
}

// ---- packages/trpc/src/routers/event.ts bodies

export interface UpdateEventMetaInput {
  projectId: string;
  name: string;
  icon?: string;
  color?: string;
  conversion?: boolean;
}

export async function updateEventMeta(
  deps: ServiceDeps,
  { projectId, name, icon, color, conversion }: UpdateEventMetaInput
) {
  await getEventMetasCached.clear(deps, projectId);
  return deps.db.eventMeta.upsert({
    where: {
      name_projectId: {
        name,
        projectId,
      },
    },
    create: { projectId, name, icon, color, conversion },
    update: { icon, color, conversion },
  });
}

export async function getEventDetails(
  deps: ServiceDeps,
  input: {
    projectId: string;
    id: string;
    createdAt?: Date;
  }
) {
  const event = await getEventById(deps, input);
  if (!event) {
    return null;
  }
  const { getSessionById } = await loadSessionService();
  const session = event.sessionId
    ? await getSessionById(event.sessionId, input.projectId).catch(
        () => undefined
      )
    : undefined;
  return { event, session };
}

export interface EventListPageInput {
  projectId: string;
  profileId?: string | null;
  sessionId?: string | null;
  groupId?: string | null;
  cohortId?: string | null;
  cursor?: string | null;
  filters?: IChartEventFilter[];
  startDate?: Date | null;
  endDate?: Date | null;
  events?: string[] | null;
  columnVisibility?: Record<string, boolean> | null;
}

const EVENT_LIST_PAGE_TAKE = 50;

function pageSelect(
  columnVisibility: Record<string, boolean> | null | undefined
): EventListSelect {
  return {
    ...columnVisibility,
    city: columnVisibility?.country ?? true,
    path: columnVisibility?.name ?? true,
    duration: columnVisibility?.name ?? true,
    projectId: false,
    revenue: true,
  };
}

// Hacky join to get profile for entire session
// TODO: Replace this with a join on the session table
function shareSessionProfiles(items: IServiceEvent[]) {
  const map = new Map<string, IServiceProfile>(); // sessionId -> profile
  for (const item of items) {
    if (item.sessionId && item.profile?.isExternal === true) {
      map.set(item.sessionId, item.profile);
    }
  }

  for (const item of items) {
    const profile = map.get(item.sessionId);
    if (profile && (item.profile?.isExternal === false || !item.profile)) {
      item.profile = clone(profile);
      if (item?.profile?.firstName) {
        item.profile.firstName = `* ${item.profile.firstName}`;
      }
    }
  }
}

function toEventListPage(items: IServiceEvent[]) {
  shareSessionProfiles(items);
  const lastItem = items.at(-1);
  return {
    data: items,
    meta: {
      next:
        items.length > 0 && lastItem ? lastItem.createdAt.toISOString() : null,
    },
  };
}

export async function getEventListPage(
  deps: ServiceDeps,
  { columnVisibility, ...input }: EventListPageInput
) {
  const items = await getEventList(deps, {
    projectId: input.projectId,
    filters: input.filters,
    profileId: input.profileId ?? undefined,
    sessionId: input.sessionId ?? undefined,
    groupId: input.groupId ?? undefined,
    cohortId: input.cohortId ?? undefined,
    startDate: input.startDate ?? undefined,
    endDate: input.endDate ?? undefined,
    events: input.events ?? undefined,
    take: EVENT_LIST_PAGE_TAKE,
    cursor: input.cursor ? new Date(input.cursor) : undefined,
    select: pageSelect(columnVisibility),
  });
  return toEventListPage(items);
}

export type ConversionListPageInput = Pick<
  EventListPageInput,
  | 'projectId'
  | 'cursor'
  | 'startDate'
  | 'endDate'
  | 'events'
  | 'columnVisibility'
>;

export async function getConversionListPage(
  deps: ServiceDeps,
  { columnVisibility, ...input }: ConversionListPageInput
) {
  const conversions = await getConversionEventNames(deps, input.projectId);
  const filteredConversions = conversions.filter((event) => {
    if (input.events && input.events.length > 0) {
      return input.events.includes(event.name);
    }
    return true;
  });

  if (filteredConversions.length === 0) {
    return { data: [], meta: { next: null } };
  }

  const items = await getEventList(deps, {
    projectId: input.projectId,
    startDate: input.startDate ?? undefined,
    endDate: input.endDate ?? undefined,
    events: input.events ?? undefined,
    take: EVENT_LIST_PAGE_TAKE,
    cursor: input.cursor ? new Date(input.cursor) : undefined,
    select: pageSelect(columnVisibility),
    conversionNames: filteredConversions.map((event) => event.name),
  });
  return toEventListPage(items);
}

export async function getBotEventsPage(
  deps: ServiceDeps,
  {
    projectId,
    cursor,
    limit,
  }: {
    projectId: string;
    cursor?: number;
    limit: number;
  }
) {
  const [events, counts] = await Promise.all([
    chQuery<IClickhouseBotEvent>(
      deps,
      botEventsQuery({ projectId, limit, offset: (cursor ?? 0) * limit })
    ),
    chQuery<{ count: number }>(deps, botEventsCountQuery(projectId)),
  ]);

  return {
    data: events.map((item) => ({
      ...item,
      createdAt: convertClickhouseDateToJs(item.created_at),
    })),
    count: counts[0]?.count ?? 0,
  };
}

export async function getTopOrigins(deps: ServiceDeps, projectId: string) {
  const res = await chQuery<{ origin: string; count: number }>(
    deps,
    topOriginsQuery(projectId)
  );
  return res.filter(
    (item) => item.origin && !item.origin.includes(LOCALHOST_ORIGIN_MARKER)
  );
}

export interface EventService {
  getById(input: {
    projectId: string;
    id: string;
    createdAt?: Date;
  }): Promise<IServiceEvent | null>;
  create(
    payload: IServiceCreateEventPayloadWithId
  ): Promise<{ document: IClickhouseEvent }>;
}

export function createEventService(deps: ServiceDeps): EventService {
  return {
    getById: (input) => getEventById(deps, input),
    create: (payload) => createEvent(deps, payload),
  };
}
