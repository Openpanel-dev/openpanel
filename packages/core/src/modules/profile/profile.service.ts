// Ported from packages/db/src/services/profile.service.ts, the query bodies of
// packages/trpc/src/routers/profile.ts and apps/api/src/controllers/
// profile.controller.ts (M7-002). The db file is now a re-export shim over
// this one, so @openpanel/db importers (packages/trpc, the assistant/mcp
// tools, apps/api's controllers, notification.service, the buffers' types)
// keep working while V1 runs (DELEGATE PATTERN).
//
// Every query is a `sql` fragment (src/profile.sql.ts), converted one at a
// time with a result-set proof each, per ADR-013. `buildFilterWhere` is NOT
// converted here: it is the shared filter compiler, out of this task's scope;
// src/filter-clauses.ts is the one bridge.
//
// db/ch/buffer access is LAZY (`load*` below) for the reason
// insight.service.ts's header gives: constructing @openpanel/db's clients at
// import time spawns a pino-pretty worker per `bun test --isolate` file.

import { strip, toObject } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import { assocPath, flatten, map, pathOr, pipe, prop, sort, uniq } from 'ramda';
import { loadDbBuffers } from '../../buffers/lazy-db-buffers';
import type { ServiceDeps } from '../../services';
import type { IClickhouseEvent } from '../event/event.service';
import type { IClickhouseSession } from '../session/session.service';
import { convertClickhouseDateToJs, formatClickhouseDate } from './src/dates';
import type { CompiledFilterClauses } from './src/filter-clauses';
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
} from './src/profile.sql';

export { profileSearchCondition, profileSearchSql } from './src/profile.sql';

const PROFILES_CACHE_SECONDS = 60 * 5;
const PROPERTY_KEYS_CACHE_SECONDS = 60;
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

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

function loadProfileBuffer() {
  return loadDbBuffers().then((m) => m.profileBuffer);
}

function loadFilterCompiler() {
  return import('../chart/src/table-filter-where');
}

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
  const { buildFilterWhere } = await loadFilterCompiler();
  return buildFilterWhere(filters, projectId, PROFILE_FILTER_TARGET);
}

export async function getProfileMetrics(
  profileId: string,
  projectId: string
): Promise<IProfileMetrics> {
  const { chQuery, toNullIfDefaultMinDate } = await loadChClient();
  const [data] = await chQuery<
    Omit<IProfileMetrics, 'lastSeen' | 'firstSeen'> & {
      lastSeen: string;
      firstSeen: string;
    }
  >(profileMetricsQuery({ profileId, projectId }));
  const metrics = data!;
  return {
    ...metrics,
    lastSeen: toNullIfDefaultMinDate(metrics.lastSeen),
    firstSeen: toNullIfDefaultMinDate(metrics.firstSeen),
  };
}

export async function getProfileById(
  id: string,
  projectId: string
): Promise<IServiceProfile | null> {
  if (id === '' || projectId === '') {
    return null;
  }

  const profileBuffer = await loadProfileBuffer();
  const cachedProfile = await profileBuffer.fetchFromCache(id, projectId);
  if (cachedProfile) {
    return transformProfile(cachedProfile);
  }

  const { chQuery } = await loadChClient();
  const [profile] = await chQuery<IClickhouseProfile>(
    profileByIdQuery({ id: String(id), projectId })
  );

  return profile ? transformProfile(profile) : null;
}

export async function getProfiles(
  ids: string[],
  projectId: string
): Promise<IServiceProfile[]> {
  const filteredIds = uniq(ids.filter((id) => id !== ''));
  if (filteredIds.length === 0) {
    return [];
  }

  const { chQuery } = await loadChClient();
  const data = await chQuery<IClickhouseProfile>(
    profilesByIdsQuery({ projectId, ids: filteredIds })
  );
  return data.map(transformProfile);
}

export const getProfilesCached = cacheable(getProfiles, PROFILES_CACHE_SECONDS);

export interface GetProfileListOptions {
  projectId: string;
  take: number;
  cursor?: number;
  filters?: IChartEventFilter[];
  search?: string;
  isExternal?: boolean;
}

export async function getProfileList({
  take,
  cursor,
  projectId,
  filters,
  search,
  isExternal,
}: GetProfileListOptions): Promise<IServiceProfile[]> {
  const { chQuery } = await loadChClient();
  const data = await chQuery<IClickhouseProfile>(
    profileListQuery({
      projectId,
      take,
      offset: Math.max(0, (cursor ?? 0) * take),
      search,
      isExternal,
      filterClauses: await compileProfileFilters(filters, projectId),
    })
  );
  return data.map(transformProfile);
}

export async function getProfileListCount({
  projectId,
  filters,
  isExternal,
  search,
}: Omit<GetProfileListOptions, 'cursor' | 'take'>): Promise<number> {
  const { chQuery } = await loadChClient();
  const data = await chQuery<{ count: number }>(
    profileListCountQuery({
      projectId,
      search,
      isExternal,
      filterClauses: await compileProfileFilters(filters, projectId),
    })
  );
  return data[0]?.count ?? 0;
}

export async function upsertProfile(
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

  const profileBuffer = await loadProfileBuffer();
  await profileBuffer.add(profile, isFromEvent);
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
  input: FindProfilesInput
): Promise<IClickhouseProfile[]> {
  const { chQuery } = await loadChClient();
  return chQuery<IClickhouseProfile>(
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
  projectId: string,
  profileId: string,
  eventLimit = RECENT_EVENTS_DEFAULT_LIMIT
): Promise<{
  profile: IClickhouseProfile | null;
  recent_events: IClickhouseEvent[];
}> {
  const { chQuery } = await loadChClient();
  const [profiles, recent_events] = await Promise.all([
    chQuery<IClickhouseProfile>(profileRowQuery({ projectId, profileId })),
    chQuery<IClickhouseEvent>(
      profileRecentEventsQuery({ projectId, profileId, limit: eventLimit }),
      CLIX_SESSION_TIMEZONE
    ),
  ]);

  return { profile: profiles[0] ?? null, recent_events };
}

export async function getProfileSessionsCore(
  projectId: string,
  profileId: string,
  limit = SESSIONS_DEFAULT_LIMIT
): Promise<IClickhouseSession[]> {
  const { chQuery } = await loadChClient();
  return chQuery<IClickhouseSession>(
    profileSessionsQuery({ projectId, profileId, limit }),
    CLIX_SESSION_TIMEZONE
  );
}

export async function getProfileMetricsCore(input: {
  projectId: string;
  profileId: string;
}) {
  const raw = await getProfileMetrics(input.profileId, input.projectId);
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
  projectId: string
): Promise<string[]> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ key: string }>(
    profilePropertyKeysQuery(projectId),
    CLIX_SESSION_TIMEZONE
  );
  return rows.map((r) => r.key).sort();
}

// Cached by projectId only: the picker's tRPC-level cache keys on the whole
// input, which includes `event`, so without this the full profile scan would
// repeat once per event within the same window.
export const getProfilePropertyKeysCached = cacheable(
  getProfilePropertyKeys,
  PROPERTY_KEYS_CACHE_SECONDS
);

// ---- the trpc profile router's bodies

export async function getProfileActivity(profileId: string, projectId: string) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; date: string }>(
    profileActivityQuery({ projectId, profileId })
  );
}

export async function getProfileMostEvents(
  profileId: string,
  projectId: string
) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; name: string }>(
    profileMostEventsQuery({ projectId, profileId })
  );
}

export async function getProfilePopularRoutes(
  profileId: string,
  projectId: string
) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; path: string }>(
    profilePopularRoutesQuery({ projectId, profileId })
  );
}

/** Property paths for the profile filter picker, array indexes wildcarded. */
export async function getProfilePropertyNames(
  projectId: string
): Promise<string[]> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ keys: string[] }>(
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

export async function getProfileListPage(input: GetProfileListOptions) {
  const [data, count] = await Promise.all([
    getProfileList(input),
    getProfileListCount(input),
  ]);
  return {
    data,
    meta: { count, pageCount: input.take },
  };
}

export async function getPowerUsers(input: {
  projectId: string;
  cursor?: number;
  take: number;
}) {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ profile_id: string; count: number }>(
    powerUsersQuery({
      projectId: input.projectId,
      take: input.take,
      offset: input.cursor ? input.cursor * input.take : 0,
    })
  );
  const profiles = await getProfiles(
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

export async function getProfileValues(input: {
  projectId: string;
  property: string;
}): Promise<{ values: string[] }> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ values: string[] }>(profileValuesQuery(input));

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
  projectId: string,
  payload: IdentifyProfileInput,
  request: ProfileRequestContext
): Promise<void> {
  await upsertProfile({
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
  projectId: string,
  input: { profileId: string; property: string; delta: number }
): Promise<AdjustProfilePropertyResult> {
  const profile = await getProfileById(input.profileId, projectId);
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

  await upsertProfile({
    id: profile.id,
    projectId,
    properties: assocPath(path, current + input.delta, profile.properties),
    isExternal: true,
  });

  return { status: 'ok', profileId: profile.id };
}

export interface ProfileService {
  byId(id: string, projectId: string): Promise<IServiceProfile | null>;
  upsert(input: IServiceUpsertProfile, isFromEvent?: boolean): Promise<void>;
}

export function createProfileService(_deps: ServiceDeps): ProfileService {
  return {
    byId: getProfileById,
    upsert: upsertProfile,
  };
}
