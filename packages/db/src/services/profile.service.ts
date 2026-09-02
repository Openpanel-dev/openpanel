import { strip, toObject } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import { uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { profileBuffer } from '../buffers';
import {
  ch,
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  TABLE_NAMES,
  toNullIfDefaultMinDate,
} from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { type SqlBuilderObject, createSqlBuilder } from '../sql-builder';
import type { IClickhouseEvent } from './event.service';
import { buildFilterWhere } from './filter-where.service';
import type { IClickhouseSession } from './session.service';

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
/**
 * SQL for the profile metrics panel: one point-read of the profile row
 * (first/last seen) plus ONE conditional-aggregate scan of the profile's
 * events.
 *
 * Previously every metric lived in its own CTE, so the same
 * `profile_id = X AND project_id = Y` slice of the events table was scanned
 * eight times per profile view. All of those metrics are plain aggregates
 * over the same rows, so they collapse into a single pass with
 * countIf/avgIf/sumIf — identical values, one scan.
 *
 * Exported for SQL-shape tests.
 */
export function buildProfileMetricsSql(
  profileId: string,
  projectId: string
): string {
  const pid = sqlstring.escape(projectId);
  const uid = sqlstring.escape(profileId);
  return `
    WITH profileSeen AS (
      SELECT created_at as firstSeen, last_seen_at as lastSeen
      FROM ${TABLE_NAMES.profiles} FINAL
      WHERE id = ${uid} AND project_id = ${pid}
      LIMIT 1
    ),
    eventStats AS (
      SELECT
        countIf(name = 'screen_view') as screenViews,
        countIf(name = 'session_start') as sessions,
        round(avgIf(duration, name = 'session_end' AND duration != 0) / 1000 / 60, 2) as durationAvg,
        round(quantilesExactInclusiveIf(0.9)(duration, name = 'session_end' AND duration != 0)[1] / 1000 / 60, 2) as durationP90,
        count(*) as totalEvents,
        count(DISTINCT toDate(created_at)) as uniqueDaysActive,
        round(avgIf(properties['__bounce'] = '1', name = 'session_end') * 100, 4) as bounceRate,
        countIf(name NOT IN ('screen_view', 'session_start', 'session_end')) as conversionEvents,
        sumIf(revenue, name = 'revenue') as revenue
      FROM ${TABLE_NAMES.events}
      WHERE profile_id = ${uid} AND project_id = ${pid}
    )
    SELECT
      (SELECT lastSeen FROM profileSeen) as lastSeen,
      (SELECT firstSeen FROM profileSeen) as firstSeen,
      screenViews,
      sessions,
      durationAvg,
      durationP90,
      totalEvents,
      uniqueDaysActive,
      bounceRate,
      round(totalEvents / nullIf(sessions, 0), 2) as avgEventsPerSession,
      conversionEvents,
      CASE
        WHEN sessions <= 1 THEN 0
        ELSE round(dateDiff('second', (SELECT firstSeen FROM profileSeen), (SELECT lastSeen FROM profileSeen)) / nullIf(sessions - 1, 0), 1)
      END as avgTimeBetweenSessions,
      revenue
    FROM eventStats
  `;
}

export function getProfileMetrics(profileId: string, projectId: string) {
  return chQuery<
    Omit<IProfileMetrics, 'lastSeen' | 'firstSeen'> & {
      lastSeen: string;
      firstSeen: string;
    }
  >(buildProfileMetricsSql(profileId, projectId))
    .then((data) => data[0]!)
    .then((data) => {
      return {
        ...data,
        lastSeen: toNullIfDefaultMinDate(data.lastSeen),
        firstSeen: toNullIfDefaultMinDate(data.firstSeen),
      };
    });
}

export async function getProfileById(id: string, projectId: string) {
  if (id === '' || projectId === '') {
    return null;
  }

  const cachedProfile = await profileBuffer.fetchFromCache(id, projectId);
  if (cachedProfile) {
    return transformProfile(cachedProfile);
  }

  const [profile] = await chQuery<IClickhouseProfile>(
    `SELECT ${PROFILE_COLUMNS}
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE id = ${sqlstring.escape(String(id))} AND project_id = ${sqlstring.escape(projectId)}
    LIMIT 1`
  );

  if (!profile) {
    return null;
  }

  return transformProfile(profile);
}

interface GetProfileListOptions {
  projectId: string;
  take: number;
  cursor?: number;
  filters?: IChartEventFilter[];
  search?: string;
  isExternal?: boolean;
}

/**
 * Build a profile search predicate that handles multi-token queries like
 * "John Smith" — splits on whitespace, requires every token to match SOME
 * profile field (id/email/first/last/full name), case-insensitively. Pasting a
 * full profile id matches on `id`. Returns `null` when the search string is
 * empty.
 */
export function profileSearchSql(search: string | null | undefined): string | null {
  const tokens = (search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length === 0) return null;
  const perToken = tokens.map((token) => {
    const like = sqlstring.escape(`%${token}%`);
    return `(id ILIKE ${like} OR email ILIKE ${like} OR first_name ILIKE ${like} OR last_name ILIKE ${like} OR concat(first_name, ' ', last_name) ILIKE ${like})`;
  });
  return `(${perToken.join(' AND ')})`;
}

export async function getProfiles(ids: string[], projectId: string) {
  const filteredIds = uniq(ids.filter((id) => id !== ''));

  if (filteredIds.length === 0) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    `SELECT ${PROFILE_COLUMNS}
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE
      project_id = ${sqlstring.escape(projectId)} AND
      id IN (${filteredIds.map((id) => sqlstring.escape(id)).join(',')})
    `
  );

  return data.map(transformProfile);
}

export const getProfilesCached = cacheable(getProfiles, 60 * 5);

type ProfileListFilterOptions = Omit<GetProfileListOptions, 'cursor' | 'take'>;

/** Where clause shared by the profile list and its count, so the two agree. */
function applyProfileListWhere(
  sb: SqlBuilderObject,
  { projectId, filters, search, isExternal }: ProfileListFilterOptions,
) {
  sb.where.project_id = `project_id = ${sqlstring.escape(projectId)}`;
  const searchClause = profileSearchSql(search);
  if (searchClause) {
    sb.where.search = searchClause;
  }
  if (isExternal !== undefined) {
    sb.where.external = `is_external = ${isExternal ? 'true' : 'false'}`;
  }
  if (filters?.length) {
    Object.assign(
      sb.where,
      buildFilterWhere(filters, projectId, {
        selfTable: 'profiles',
        profileIdExpr: 'id',
        groupsExpr: 'groups',
      }),
    );
  }
}

export function buildProfileListSql({
  take,
  cursor,
  ...options
}: GetProfileListOptions) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = `${TABLE_NAMES.profiles} FINAL`;
  sb.select.all = '*';
  sb.limit = take;
  sb.offset = Math.max(0, (cursor ?? 0) * take);
  sb.orderBy.created_at = 'created_at DESC';
  applyProfileListWhere(sb, options);
  return getSql();
}

export function buildProfileListCountSql(options: ProfileListFilterOptions) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = TABLE_NAMES.profiles;
  // One profile is several rows until a background merge collapses them, so
  // counting rows overcounts against the FINAL list. uniqExact deduplicates
  // without FINAL, which cannot spill to disk on large projects.
  sb.select.count = 'uniqExact(id) as count';
  sb.groupBy.project_id = 'project_id';
  applyProfileListWhere(sb, options);
  return getSql();
}

export async function getProfileList(options: GetProfileListOptions) {
  const data = await chQuery<IClickhouseProfile>(buildProfileListSql(options));
  return data.map(transformProfile);
}

export async function getProfileListCount(options: ProfileListFilterOptions) {
  const data = await chQuery<{ count: number }>(
    buildProfileListCountSql(options),
  );
  return data[0]?.count ?? 0;
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

export function upsertProfile(
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
) {
  const now = formatClickhouseDate(new Date());
  const profile: IClickhouseProfile = {
    id: String(id),
    first_name: firstName || '',
    last_name: lastName || '',
    email: email || '',
    avatar: avatar || '',
    properties: strip((properties as Record<string, string | undefined>) || {}),
    project_id: projectId,
    // First-seen value for brand-new profiles. The buffer's mergeProfiles
    // omits `created_at` from incoming, so for existing profiles the original
    // value is carried forward.
    created_at: now,
    // RMT version column — must advance on every write so the latest row wins.
    last_seen_at: now,
    is_external: isExternal,
    groups: groups ?? [],
  };

  return profileBuffer.add(profile, isFromEvent);
}

export const PROFILE_COLUMNS =
  'id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, last_seen_at, groups';

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

export function findProfilesCore(
  input: FindProfilesInput
): Promise<IClickhouseProfile[]> {
  const pid = sqlstring.escape(input.projectId);
  const conditions: string[] = [`project_id = ${pid}`];

  if (input.email) {
    conditions.push(`email ILIKE ${sqlstring.escape(`%${input.email}%`)}`);
  }
  if (input.name) {
    const nameClause = profileSearchSql(input.name);
    if (nameClause) conditions.push(nameClause);
  }
  if (input.country) {
    conditions.push(
      `properties['country'] = ${sqlstring.escape(input.country)}`
    );
  }
  if (input.city) {
    conditions.push(`properties['city'] = ${sqlstring.escape(input.city)}`);
  }
  if (input.device) {
    conditions.push(`properties['device'] = ${sqlstring.escape(input.device)}`);
  }
  if (input.browser) {
    conditions.push(
      `properties['browser'] = ${sqlstring.escape(input.browser)}`
    );
  }

  if (input.inactiveDays !== undefined) {
    const days = Math.floor(input.inactiveDays);
    conditions.push(`id NOT IN (
      SELECT DISTINCT profile_id FROM ${TABLE_NAMES.events}
      WHERE project_id = ${pid}
        AND profile_id != ''
        AND created_at >= now() - INTERVAL ${days} DAY
    )`);
  }

  if (input.minSessions !== undefined) {
    const min = Math.floor(input.minSessions);
    conditions.push(`id IN (
      SELECT profile_id FROM ${TABLE_NAMES.sessions}
      WHERE project_id = ${pid}
        AND sign = 1
        AND profile_id != ''
      GROUP BY profile_id
      HAVING count() >= ${min}
    )`);
  }

  if (input.performedEvent) {
    conditions.push(`id IN (
      SELECT DISTINCT profile_id FROM ${TABLE_NAMES.events}
      WHERE project_id = ${pid}
        AND name = ${sqlstring.escape(input.performedEvent)}
    )`);
  }

  if (input.filters?.length) {
    const filterClauses = buildFilterWhere(input.filters, input.projectId, {
      selfTable: 'profiles',
      profileIdExpr: 'id',
      groupsExpr: 'groups',
    });
    conditions.push(...Object.values(filterClauses));
  }

  const orderDir = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(input.limit ?? 20, 100);

  const sql = `
    SELECT ${PROFILE_COLUMNS}
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ${orderDir}
    LIMIT ${limit}
  `;

  return chQuery<IClickhouseProfile>(sql);
}

export async function getProfileWithEvents(
  projectId: string,
  profileId: string,
  eventLimit = 10
): Promise<{
  profile: IClickhouseProfile | null;
  recent_events: IClickhouseEvent[];
}> {
  const [profiles, recent_events] = await Promise.all([
    chQuery<IClickhouseProfile>(`
      SELECT ${PROFILE_COLUMNS}
      FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)} AND id = ${sqlstring.escape(profileId)}
      LIMIT 1
    `),
    clix(ch)
      .select<IClickhouseEvent>([])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('profile_id', '=', profileId)
      .orderBy('created_at', 'DESC')
      .limit(eventLimit)
      .execute(),
  ]);

  return { profile: profiles[0] ?? null, recent_events };
}

export function getProfileSessionsCore(
  projectId: string,
  profileId: string,
  limit = 20
): Promise<IClickhouseSession[]> {
  return clix(ch)
    .select<IClickhouseSession>([])
    .from(TABLE_NAMES.sessions)
    .where('project_id', '=', projectId)
    .where('profile_id', '=', profileId)
    .where('sign', '=', 1)
    .orderBy('created_at', 'DESC')
    .limit(limit)
    .execute();
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

/**
 * Every distinct key present in any external profile's `properties` map.
 *
 * Aggregated across all profiles rather than sampled — a `LIMIT n` sample with
 * no `ORDER BY` returns whichever rows ClickHouse's scheduler happens to
 * produce, so the key set varied between requests and properties set on a small
 * fraction of profiles were usually missing from the picker entirely.
 *
 * `FINAL` isn't needed: older row versions can only contribute keys that
 * genuinely existed at some point.
 */
export async function getProfilePropertyKeys(
  projectId: string,
): Promise<string[]> {
  const rows = await clix(ch)
    .select<{ key: string }>(['DISTINCT arrayJoin(mapKeys(properties)) as key'])
    .from(TABLE_NAMES.profiles)
    .where('project_id', '=', projectId)
    .where('is_external', '=', true)
    .execute();
  return rows.map((r) => r.key).sort();
}

/**
 * Cached by projectId only. The picker's tRPC-level cache keys on the whole
 * input, which includes `event` — so without this the full profile scan would
 * repeat once per event within the same window, even though the profile keys
 * don't depend on the event at all.
 */
export const getProfilePropertyKeysCached = cacheable(
  getProfilePropertyKeys,
  60,
);
