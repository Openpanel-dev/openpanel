// Ported from packages/db/src/services/profile.service.ts, the query bodies of
// packages/trpc/src/routers/profile.ts and apps/api/src/controllers/
// profile.controller.ts (M7-002). The db file is now a re-export shim over
// this one, so @openpanel/db importers (packages/trpc, the assistant/mcp
// tools, apps/api's controllers, notification.service, the buffers' types)
// keep working while V1 runs (DELEGATE PATTERN).
//
// Every query is a `sql` fragment (src/sql.ts), converted one at a
// time with a result-set proof each, per ADR-013. `buildFilterWhere` is NOT
// converted here: it is the shared filter compiler, out of this task's scope;
// src/filter-clauses.ts is the one bridge.
//
// M10-005: every function that touches ClickHouse or the profile buffer takes
// `ServiceDeps` and reaches them as `deps.ch` (through ch-query.ts) and
// `deps.buffers.profile`. The `loadChClient` / `loadProfileBuffer` lazy
// loaders are gone (docs/TECH_DEBT.md §2, §4), and M15-202 made the last one
// — the shared filter compiler — a plain static sibling import (ADR-022 R6).

import { strip, toObject } from '@openpanel/shared';
import { assocPath, flatten, map, pathOr, pipe, prop, sort, uniq } from 'ramda';
import { cacheablePerDeps } from '../../cacheable-per-deps';
import { chQuery } from '../../ch-query';
import type { ServiceDeps, Services } from '../../services';
import { buildFilterWhere } from '../chart/src/table-filter-where';
import type { IClickhouseEvent } from '../event/event.service';
import type { IChartEventFilter } from '../report/report.constants';
import type { IClickhouseSession } from '../session/session.service';
import {
  convertClickhouseDateToJs,
  formatClickhouseDate,
  toNullIfDefaultMinDate,
} from './src/dates';
import type { CompiledFilterClauses } from './src/filter-clauses';
import type { ProfileWindow } from './src/sql';
import {
  findProfilesQuery,
  powerUsersQuery,
  profileActivityQuery,
  profileByIdQuery,
  profileListCountQuery,
  profileListQuery,
  profileMetricsQuery,
  profileMostEventsQuery,
  profilePopularRoutesQuery,
  profilePropertyKeysQuery,
  profilePropertyNamesQuery,
  profileRecentEventsQuery,
  profileRowQuery,
  profileSessionsQuery,
  profilesByIdsQuery,
  profileValuesQuery,
} from './src/sql';

export { profileSearchCondition } from './src/sql';

const PROFILES_CACHE_SECONDS = 60 * 5;
const PROPERTY_KEYS_CACHE_SECONDS = 60;
// V1's `cacheable(fn, ...)` derived these from the functions' own names;
// naming them keeps the Redis keys `cachable:getProfiles:<args>` and
// `cachable:getProfilePropertyKeys:<projectId>`.
const PROFILES_CACHE_NAME = 'getProfiles';
const PROPERTY_KEYS_CACHE_NAME = 'getProfilePropertyKeys';
const RECENT_EVENTS_DEFAULT_LIMIT = 10;
const SESSIONS_DEFAULT_LIMIT = 20;
const FIND_PROFILES_DEFAULT_LIMIT = 20;
const FIND_PROFILES_MAX_LIMIT = 100;

// clix always sent `session_timezone: 'UTC'`; the queries converted from clix
// keep sending it so their result sets stay identical.
const CLIX_SESSION_TIMEZONE = { session_timezone: 'UTC' } as const;

const PROFILE_FILTER_TARGET = {
  selfTable: 'profiles',
  profileIdExpr: 'id',
  groupsExpr: 'groups',
} as const;

const ARRAY_INDEX_PATH_SEGMENT = /\.([0-9]+)\./g;
const ARRAY_INDEX_PATH_TAIL = /\.([0-9]+)/g;

export interface IProfileMetrics {
  lastSeen: Date | null;
  firstSeen: Date | null;
  screenViews: number;
  sessions: number;
  durationAvg: number;
  durationP90: number;
  totalEvents: number;
  uniqueDaysActive: number;
  bounceRate: number;
  avgEventsPerSession: number;
  conversionEvents: number;
  avgTimeBetweenSessions: number;
  revenue: number;
}

export interface IServiceProfile {
  id: string;
  email: string;
  avatar: string;
  firstName: string;
  lastName: string;
  /** First time this profile was seen — preserved across upserts. */
  createdAt: Date;
  /** Most recent activity. ReplacingMergeTree version column. */
  lastSeenAt: Date;
  isExternal: boolean;
  projectId: string;
  groups: string[];
  properties: Record<string, unknown> & {
    region?: string;
    country?: string;
    city?: string;
    os?: string;
    os_version?: string;
    browser?: string;
    browser_version?: string;
    referrer_name?: string;
    referrer_type?: string;
    device?: string;
    brand?: string;
    model?: string;
    referrer?: string;
  };
}

export interface IClickhouseProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar: string;
  properties: Record<string, string | undefined>;
  project_id: string;
  is_external: boolean;
  /** First time this profile was seen — preserved across upserts. */
  created_at: string;
  /** Most recent activity. ReplacingMergeTree version column. */
  last_seen_at: string;
  groups: string[];
}

export interface IServiceUpsertProfile {
  projectId: string;
  id: string | number;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
  isExternal: boolean;
  groups?: string[];
}

export function transformProfile({
  created_at,
  last_seen_at,
  first_name,
  last_name,
  ...profile
}: IClickhouseProfile): IServiceProfile {
  const createdAtJs = convertClickhouseDateToJs(created_at);
  return {
    firstName: first_name,
    lastName: last_name,
    isExternal: profile.is_external,
    properties: toObject(profile.properties),
    createdAt: createdAtJs,
    lastSeenAt: last_seen_at
      ? convertClickhouseDateToJs(last_seen_at)
      : createdAtJs,
    projectId: profile.project_id,
    id: profile.id,
    email: profile.email,
    avatar: profile.avatar,
    groups: profile.groups ?? [],
  };
}

async function compileProfileFilters(
  filters: IChartEventFilter[] | undefined,
  projectId: string
): Promise<CompiledFilterClauses> {
  if (!filters?.length) {
    return {};
  }
  return buildFilterWhere(filters, projectId, PROFILE_FILTER_TARGET);
}

/**
 * `null` when nothing is known about the profile — no row in `profiles` and no
 * events. The query aggregates, so an unknown id comes back as a row of zeros
 * rather than as no row at all, and callers that reported those zeros were
 * indistinguishable from a real but inactive user. A profile that exists and
 * simply has no events still returns metrics, with a `firstSeen`.
 */
export async function getProfileMetrics(
  deps: ServiceDeps,
  profileId: string,
  projectId: string
): Promise<IProfileMetrics | null> {
  const [data] = await chQuery<
    Omit<IProfileMetrics, 'lastSeen' | 'firstSeen'> & {
      lastSeen: string;
      firstSeen: string;
    }
  >(deps, profileMetricsQuery({ profileId, projectId }));

  if (!data) {
    return null;
  }

  const lastSeen = toNullIfDefaultMinDate(data.lastSeen);
  const firstSeen = toNullIfDefaultMinDate(data.firstSeen);
  if (lastSeen === null && firstSeen === null && data.totalEvents === 0) {
    return null;
  }

  return { ...data, lastSeen, firstSeen };
}

export async function getProfileById(
  deps: ServiceDeps,
  id: string,
  projectId: string
): Promise<IServiceProfile | null> {
  if (id === '' || projectId === '') {
    return null;
  }

  const cachedProfile = await deps.buffers.profile.fetchFromCache(
    id,
    projectId
  );
  if (cachedProfile) {
    return transformProfile(cachedProfile);
  }

  const [profile] = await chQuery<IClickhouseProfile>(
    deps,
    profileByIdQuery({ id: String(id), projectId })
  );

  return profile ? transformProfile(profile) : null;
}

export async function getProfiles(
  deps: ServiceDeps,
  ids: string[],
  projectId: string
): Promise<IServiceProfile[]> {
  const filteredIds = uniq(ids.filter((id) => id !== ''));
  if (filteredIds.length === 0) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    deps,
    profilesByIdsQuery({ projectId, ids: filteredIds })
  );
  return data.map(transformProfile);
}

export const getProfilesCached = cacheablePerDeps(
  PROFILES_CACHE_NAME,
  getProfiles,
  PROFILES_CACHE_SECONDS
);

export interface GetProfileListOptions extends ProfileWindow {
  projectId: string;
  take: number;
  cursor?: number;
  filters?: IChartEventFilter[];
  search?: string;
  isExternal?: boolean;
}

export async function getProfileList(
  deps: ServiceDeps,
  {
    take,
    cursor,
    projectId,
    filters,
    search,
    isExternal,
    startDate,
    endDate,
  }: GetProfileListOptions
): Promise<IServiceProfile[]> {
  const data = await chQuery<IClickhouseProfile>(
    deps,
    profileListQuery({
      projectId,
      take,
      offset: Math.max(0, (cursor ?? 0) * take),
      search,
      isExternal,
      startDate,
      endDate,
      filterClauses: await compileProfileFilters(filters, projectId),
    })
  );
  return data.map(transformProfile);
}

export async function getProfileListCount(
  deps: ServiceDeps,
  {
    projectId,
    filters,
    isExternal,
    search,
    startDate,
    endDate,
  }: Omit<GetProfileListOptions, 'cursor' | 'take'>
): Promise<number> {
  const data = await chQuery<{ count: number }>(
    deps,
    profileListCountQuery({
      projectId,
      search,
      isExternal,
      startDate,
      endDate,
      filterClauses: await compileProfileFilters(filters, projectId),
    })
  );
  return data[0]?.count ?? 0;
}

export async function upsertProfile(
  deps: ServiceDeps,
  {
    id,
    firstName,
    lastName,
    email,
    avatar,
    properties,
    projectId,
    isExternal,
    groups,
  }: IServiceUpsertProfile,
  isFromEvent = false
): Promise<void> {
  const now = formatClickhouseDate(new Date());
  const profile: IClickhouseProfile = {
    id: String(id),
    first_name: firstName || '',
    last_name: lastName || '',
    email: email || '',
    avatar: avatar || '',
    properties: strip((properties as Record<string, string | undefined>) || {}),
    project_id: projectId,
    // First-seen value for brand-new profiles; the buffer's mergeProfiles
    // omits `created_at` from incoming, so an existing profile keeps its own.
    created_at: now,
    // RMT version column — must advance on every write so the latest row wins.
    last_seen_at: now,
    is_external: isExternal,
    groups: groups ?? [],
  };

  await deps.buffers.profile.add(profile, isFromEvent);
}

export interface FindProfilesInput {
  projectId: string;
  name?: string;
  email?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  inactiveDays?: number;
  minSessions?: number;
  performedEvent?: string;
  filters?: IChartEventFilter[];
  sortBy?: 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export async function findProfilesCore(
  deps: ServiceDeps,
  input: FindProfilesInput
): Promise<IClickhouseProfile[]> {
  return chQuery<IClickhouseProfile>(
    deps,
    findProfilesQuery({
      ...input,
      inactiveDays:
        input.inactiveDays === undefined
          ? undefined
          : Math.floor(input.inactiveDays),
      minSessions:
        input.minSessions === undefined
          ? undefined
          : Math.floor(input.minSessions),
      filterClauses: await compileProfileFilters(
        input.filters,
        input.projectId
      ),
      sortOrder: input.sortOrder === 'asc' ? 'asc' : 'desc',
      limit: Math.min(
        input.limit ?? FIND_PROFILES_DEFAULT_LIMIT,
        FIND_PROFILES_MAX_LIMIT
      ),
    })
  );
}

export async function getProfileWithEvents(
  deps: ServiceDeps,
  projectId: string,
  profileId: string,
  eventLimit = RECENT_EVENTS_DEFAULT_LIMIT
): Promise<{
  profile: IClickhouseProfile | null;
  recent_events: IClickhouseEvent[];
}> {
  const [profiles, recent_events] = await Promise.all([
    chQuery<IClickhouseProfile>(
      deps,
      profileRowQuery({ projectId, profileId })
    ),
    chQuery<IClickhouseEvent>(
      deps,
      profileRecentEventsQuery({ projectId, profileId, limit: eventLimit }),
      CLIX_SESSION_TIMEZONE
    ),
  ]);

  return { profile: profiles[0] ?? null, recent_events };
}

export async function getProfileSessionsCore(
  deps: ServiceDeps,
  projectId: string,
  profileId: string,
  limit = SESSIONS_DEFAULT_LIMIT
): Promise<IClickhouseSession[]> {
  return chQuery<IClickhouseSession>(
    deps,
    profileSessionsQuery({ projectId, profileId, limit }),
    CLIX_SESSION_TIMEZONE
  );
}

export async function getProfileMetricsCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    profileId: string;
  }
) {
  const raw = await getProfileMetrics(deps, input.profileId, input.projectId);
  if (!raw) {
    throw new Error(`Profile not found or has no events: ${input.profileId}`);
  }
  return {
    profileId: input.profileId,
    firstSeen: raw.firstSeen,
    lastSeen: raw.lastSeen,
    sessions: raw.sessions,
    screenViews: raw.screenViews,
    totalEvents: raw.totalEvents,
    conversionEvents: raw.conversionEvents,
    uniqueDaysActive: raw.uniqueDaysActive,
    avgSessionDurationMin: raw.durationAvg,
    p90SessionDurationMin: raw.durationP90,
    avgEventsPerSession: raw.avgEventsPerSession,
    avgTimeBetweenSessionsSec: raw.avgTimeBetweenSessions,
    bounceRate: raw.bounceRate,
    revenue: raw.revenue,
  };
}

/** Every distinct key in any external profile's `properties` map. */
export async function getProfilePropertyKeys(
  deps: ServiceDeps,
  projectId: string
): Promise<string[]> {
  const rows = await chQuery<{ key: string }>(
    deps,
    profilePropertyKeysQuery(projectId),
    CLIX_SESSION_TIMEZONE
  );
  return rows.map((r) => r.key).sort();
}

// Cached by projectId only: the picker's tRPC-level cache keys on the whole
// input, which includes `event`, so without this the full profile scan would
// repeat once per event within the same window.
export const getProfilePropertyKeysCached = cacheablePerDeps(
  PROPERTY_KEYS_CACHE_NAME,
  getProfilePropertyKeys,
  PROPERTY_KEYS_CACHE_SECONDS
);

// ---- the trpc profile router's bodies

export async function getProfileActivity(
  deps: ServiceDeps,
  profileId: string,
  projectId: string
) {
  return chQuery<{ count: number; date: string }>(
    deps,
    profileActivityQuery({ projectId, profileId })
  );
}

export async function getProfileMostEvents(
  deps: ServiceDeps,
  profileId: string,
  projectId: string
) {
  return chQuery<{ count: number; name: string }>(
    deps,
    profileMostEventsQuery({ projectId, profileId })
  );
}

export async function getProfilePopularRoutes(
  deps: ServiceDeps,
  profileId: string,
  projectId: string
) {
  return chQuery<{ count: number; path: string }>(
    deps,
    profilePopularRoutesQuery({ projectId, profileId })
  );
}

/** Property paths for the profile filter picker, array indexes wildcarded. */
export async function getProfilePropertyNames(
  deps: ServiceDeps,
  projectId: string
): Promise<string[]> {
  const rows = await chQuery<{ keys: string[] }>(
    deps,
    profilePropertyNamesQuery(projectId)
  );

  const properties = rows
    .flatMap((row) => row.keys)
    .map((item) => item.replace(ARRAY_INDEX_PATH_SEGMENT, '.*.'))
    .map((item) => item.replace(ARRAY_INDEX_PATH_TAIL, '[*]'))
    .map((item) => `properties.${item}`);

  properties.push('id', 'first_name', 'last_name', 'email');

  return pipe(
    sort<string>((a, b) => a.length - b.length),
    uniq
  )(properties);
}

export async function getProfileListPage(
  deps: ServiceDeps,
  input: GetProfileListOptions
) {
  const [data, count] = await Promise.all([
    getProfileList(deps, input),
    getProfileListCount(deps, input),
  ]);
  return {
    data,
    meta: { count, pageCount: input.take },
  };
}

export async function getPowerUsers(
  deps: ServiceDeps,
  input: ProfileWindow & {
    projectId: string;
    cursor?: number;
    take: number;
  }
) {
  const rows = await chQuery<{ profile_id: string; count: number }>(
    deps,
    powerUsersQuery({
      projectId: input.projectId,
      take: input.take,
      offset: input.cursor ? input.cursor * input.take : 0,
      startDate: input.startDate,
      endDate: input.endDate,
    })
  );
  const profiles = await getProfiles(
    deps,
    rows.map((r) => r.profile_id),
    input.projectId
  );

  const data: (IServiceProfile & { count: number })[] = [];
  for (const row of rows) {
    const profile = profiles.find((p) => p.id === row.profile_id);
    // only rows that resolved to a real profile
    if (profile?.id) {
      data.push({ count: row.count, ...profile });
    }
  }

  return {
    data,
    meta: { count: data.length, pageCount: input.take },
  };
}

export async function getProfileValues(
  deps: ServiceDeps,
  input: {
    projectId: string;
    property: string;
  }
): Promise<{ values: string[] }> {
  const rows = await chQuery<{ values: string[] }>(
    deps,
    profileValuesQuery(input)
  );

  const values = pipe(
    (data: typeof rows) => map(prop('values'), data),
    flatten,
    uniq,
    sort((a, b) => a.length - b.length)
  )(rows);

  return { values };
}

// ---- apps/api's /profile controller bodies

export interface IdentifyProfileInput {
  /** `string | number` because /track's identify payload allows both
   *  (ingest.constants' `IProfileId`) and `upsertProfile` stores either. */
  profileId: string | number;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

export interface ProfileRequestContext {
  geo: {
    country?: string;
    city?: string;
    region?: string;
    longitude?: number;
    latitude?: number;
  };
  userAgent: {
    os?: string;
    osVersion?: string;
    browser?: string;
    browserVersion?: string;
    device?: string;
    brand?: string;
    model?: string;
  };
}

/** `POST /profile`: geo + UA fields override whatever the payload carried. */
export async function identifyProfile(
  deps: ServiceDeps,
  projectId: string,
  payload: IdentifyProfileInput,
  request: ProfileRequestContext
): Promise<void> {
  await upsertProfile(deps, {
    ...payload,
    id: payload.profileId,
    isExternal: true,
    projectId,
    properties: {
      ...(payload.properties ?? {}),
      country: request.geo.country,
      city: request.geo.city,
      region: request.geo.region,
      longitude: request.geo.longitude,
      latitude: request.geo.latitude,
      os: request.userAgent.os,
      os_version: request.userAgent.osVersion,
      browser: request.userAgent.browser,
      browser_version: request.userAgent.browserVersion,
      device: request.userAgent.device,
      brand: request.userAgent.brand,
      model: request.userAgent.model,
    },
  });
}

export type AdjustProfilePropertyResult =
  | { status: 'ok'; profileId: string }
  | { status: 'not-found' }
  | { status: 'not-a-number' };

/** `POST /profile/increment|decrement`: `delta` is signed by the caller. */
export async function adjustProfileProperty(
  deps: ServiceDeps,
  projectId: string,
  input: { profileId: string; property: string; delta: number }
): Promise<AdjustProfilePropertyResult> {
  const profile = await getProfileById(deps, input.profileId, projectId);
  if (!profile) {
    return { status: 'not-found' };
  }

  const path = input.property.split('.');
  const current = Number.parseInt(
    pathOr<string>('0', path, profile.properties),
    10
  );
  if (Number.isNaN(current)) {
    return { status: 'not-a-number' };
  }

  await upsertProfile(deps, {
    id: profile.id,
    projectId,
    properties: assocPath(path, current + input.delta, profile.properties),
    isExternal: true,
  });

  return { status: 'ok', profileId: profile.id };
}

export function createProfileService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    byId: (id: string, projectId: string): Promise<IServiceProfile | null> =>
      getProfileById(deps, id, projectId),
    upsert: (
      input: IServiceUpsertProfile,
      isFromEvent?: boolean
    ): Promise<void> => upsertProfile(deps, input, isFromEvent),
  };
}
