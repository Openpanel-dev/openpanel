import { strip, toObject } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';
import { uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { profileBuffer } from '../buffers';
import {
  chQuery,
  convertClickhouseDateToJs,
  formatClickhouseDate,
  isClickhouseDefaultMinDate,
  TABLE_NAMES,
} from '../clickhouse/client';
import { createSqlBuilder } from '../sql-builder';

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
export function getProfileMetrics(profileId: string, projectId: string) {
  return chQuery<
    Omit<IProfileMetrics, 'lastSeen' | 'firstSeen'> & {
      lastSeen: string;
      firstSeen: string;
    }
  >(`
    WITH lastSeen AS (
      SELECT max(created_at) as lastSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    firstSeen AS (
      SELECT min(created_at) as firstSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    screenViews AS (
      SELECT count(*) as screenViews FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    sessions AS (
      SELECT count(*) as sessions FROM ${TABLE_NAMES.events} WHERE name = 'session_start' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    duration AS (
      SELECT 
        round(avg(duration) / 1000 / 60, 2) as durationAvg, 
        round(quantilesExactInclusive(0.9)(duration)[1] / 1000 / 60, 2) as durationP90 
      FROM ${TABLE_NAMES.events} 
      WHERE name = 'session_end' AND duration != 0 AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    totalEvents AS (
      SELECT count(*) as totalEvents FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    uniqueDaysActive AS (
      SELECT count(DISTINCT toDate(created_at)) as uniqueDaysActive FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    bounceRate AS (
      SELECT round(avg(properties['__bounce'] = '1') * 100, 4) as bounceRate FROM ${TABLE_NAMES.events} WHERE name = 'session_end' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    avgEventsPerSession AS (
      SELECT round((SELECT totalEvents FROM totalEvents) / nullIf((SELECT sessions FROM sessions), 0), 2) as avgEventsPerSession
    ),
    conversionEvents AS (
      SELECT count(*) as conversionEvents FROM ${TABLE_NAMES.events} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    avgTimeBetweenSessions AS (
      SELECT 
        CASE 
          WHEN (SELECT sessions FROM sessions) <= 1 THEN 0
          ELSE round(dateDiff('second', (SELECT firstSeen FROM firstSeen), (SELECT lastSeen FROM lastSeen)) / nullIf((SELECT sessions FROM sessions) - 1, 0), 1)
        END as avgTimeBetweenSessions
    ),
    revenue AS (
      SELECT sum(revenue) as revenue FROM ${TABLE_NAMES.events} WHERE name = 'revenue' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    )
    SELECT 
      (SELECT lastSeen FROM lastSeen) as lastSeen, 
      (SELECT firstSeen FROM firstSeen) as firstSeen, 
      (SELECT screenViews FROM screenViews) as screenViews, 
      (SELECT sessions FROM sessions) as sessions, 
      (SELECT durationAvg FROM duration) as durationAvg, 
      (SELECT durationP90 FROM duration) as durationP90,
      (SELECT totalEvents FROM totalEvents) as totalEvents,
      (SELECT uniqueDaysActive FROM uniqueDaysActive) as uniqueDaysActive,
      (SELECT bounceRate FROM bounceRate) as bounceRate,
      (SELECT avgEventsPerSession FROM avgEventsPerSession) as avgEventsPerSession,
      (SELECT conversionEvents FROM conversionEvents) as conversionEvents,
      (SELECT avgTimeBetweenSessions FROM avgTimeBetweenSessions) as avgTimeBetweenSessions,
      (SELECT revenue FROM revenue) as revenue
  `)
    .then((data) => data[0]!)
    .then((data) => {
      return {
        ...data,
        lastSeen: isClickhouseDefaultMinDate(data.lastSeen)
          ? null
          : convertClickhouseDateToJs(data.lastSeen),
        firstSeen: isClickhouseDefaultMinDate(data.firstSeen)
          ? null
          : convertClickhouseDateToJs(data.firstSeen),
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
    `SELECT 
      id, 
      project_id,
      last_value(nullIf(first_name, '')) as first_name, 
      last_value(nullIf(last_name, '')) as last_name, 
      last_value(nullIf(email, '')) as email, 
      last_value(nullIf(avatar, '')) as avatar, 
      last_value(is_external) as is_external, 
      last_value(properties) as properties, 
      last_value(created_at) as created_at
    FROM ${TABLE_NAMES.profiles} FINAL WHERE id = ${sqlstring.escape(String(id))} AND project_id = ${sqlstring.escape(projectId)} GROUP BY id, project_id ORDER BY created_at DESC LIMIT 1`
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

export async function getProfiles(ids: string[], projectId: string) {
  const filteredIds = uniq(ids.filter((id) => id !== ''));

  if (filteredIds.length === 0) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    `SELECT 
      id, 
      project_id,
      any(nullIf(first_name, '')) as first_name, 
      any(nullIf(last_name, '')) as last_name, 
      any(nullIf(email, '')) as email, 
      any(nullIf(avatar, '')) as avatar, 
      last_value(is_external) as is_external, 
      any(properties) as properties, 
      any(created_at) as created_at,
      any(groups) as groups
    FROM ${TABLE_NAMES.profiles}
    WHERE 
      project_id = ${sqlstring.escape(projectId)} AND
      id IN (${filteredIds.map((id) => sqlstring.escape(id)).join(',')})
    GROUP BY id, project_id
    `
  );

  return data.map(transformProfile);
}

export const getProfilesCached = cacheable(getProfiles, 60 * 5);

export async function getProfileList({
  take,
  cursor,
  projectId,
  search,
  isExternal,
}: GetProfileListOptions) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = `${TABLE_NAMES.profiles} FINAL`;
  sb.select.all = '*';
  sb.where.project_id = `project_id = ${sqlstring.escape(projectId)}`;
  sb.limit = take;
  sb.offset = Math.max(0, (cursor ?? 0) * take);
  sb.orderBy.created_at = 'created_at DESC';
  if (search) {
    sb.where.search = `(email ILIKE '%${search}%' OR first_name ILIKE '%${search}%' OR last_name ILIKE '%${search}%')`;
  }
  if (isExternal !== undefined) {
    sb.where.external = `is_external = ${isExternal ? 'true' : 'false'}`;
  }
  const data = await chQuery<IClickhouseProfile>(getSql());
  return data.map(transformProfile);
}

export async function getProfileListCount({
  projectId,
  isExternal,
  search,
}: Omit<GetProfileListOptions, 'cursor' | 'take'>) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = 'profiles';
  sb.select.count = 'count(id) as count';
  sb.where.project_id = `project_id = ${sqlstring.escape(projectId)}`;
  sb.groupBy.project_id = 'project_id';
  if (search) {
    sb.where.search = `(email ILIKE '%${search}%' OR first_name ILIKE '%${search}%' OR last_name ILIKE '%${search}%')`;
  }
  if (isExternal !== undefined) {
    sb.where.external = `is_external = ${isExternal ? 'true' : 'false'}`;
  }
  const data = await chQuery<{ count: number }>(getSql());
  return data[0]?.count ?? 0;
}

export interface IServiceProfile {
  id: string;
  email: string;
  avatar: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
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
  created_at: string;
  groups: string[];
}

export interface IServiceUpsertProfile {
  projectId: string;
  id: string;
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
  first_name,
  last_name,
  ...profile
}: IClickhouseProfile): IServiceProfile {
  return {
    firstName: first_name,
    lastName: last_name,
    isExternal: profile.is_external,
    properties: toObject(profile.properties),
    createdAt: convertClickhouseDateToJs(created_at),
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
  const profile: IClickhouseProfile = {
    id,
    first_name: firstName || '',
    last_name: lastName || '',
    email: email || '',
    avatar: avatar || '',
    properties: strip((properties as Record<string, string | undefined>) || {}),
    project_id: projectId,
    created_at: formatClickhouseDate(new Date()),
    is_external: isExternal,
    groups: groups ?? [],
  };

  return profileBuffer.add(profile, isFromEvent);
}

import { ch } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import type { IClickhouseEvent } from './event.service';
import type { IClickhouseSession } from './session.service';

function esc(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const PROFILE_COLUMNS =
  'id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, groups';

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
  sortBy?: 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export async function findProfilesCore(
  input: FindProfilesInput,
): Promise<IClickhouseProfile[]> {
  const pid = esc(input.projectId);
  const conditions: string[] = [`project_id = ${pid}`];

  if (input.email) {
    conditions.push(`email LIKE ${esc('%' + input.email + '%')}`);
  }
  if (input.name) {
    const escaped = esc('%' + input.name + '%');
    conditions.push(`(first_name LIKE ${escaped} OR last_name LIKE ${escaped})`);
  }
  if (input.country) {
    conditions.push(`properties['country'] = ${esc(input.country)}`);
  }
  if (input.city) {
    conditions.push(`properties['city'] = ${esc(input.city)}`);
  }
  if (input.device) {
    conditions.push(`properties['device'] = ${esc(input.device)}`);
  }
  if (input.browser) {
    conditions.push(`properties['browser'] = ${esc(input.browser)}`);
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
        AND name = ${esc(input.performedEvent)}
    )`);
  }

  const orderDir = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(input.limit ?? 20, 100);

  const sql = `
    SELECT ${PROFILE_COLUMNS}
    FROM ${TABLE_NAMES.profiles}
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ${orderDir}
    LIMIT ${limit}
  `;

  return chQuery<IClickhouseProfile>(sql);
}

export async function getProfileWithEvents(
  projectId: string,
  profileId: string,
  eventLimit = 10,
): Promise<{
  profile: IClickhouseProfile | null;
  recent_events: IClickhouseEvent[];
}> {
  const [profiles, recent_events] = await Promise.all([
    chQuery<IClickhouseProfile>(`
      SELECT ${PROFILE_COLUMNS}
      FROM ${TABLE_NAMES.profiles}
      WHERE project_id = ${esc(projectId)} AND id = ${esc(profileId)}
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

export async function getProfileSessionsCore(
  projectId: string,
  profileId: string,
  limit = 20,
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
