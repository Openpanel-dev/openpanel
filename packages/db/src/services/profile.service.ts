import { omit, uniq } from 'ramda';
import sqlstring from 'sqlstring';

import { strip, toObject } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';

import { profileBuffer } from '../buffers';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse/client';
import { createSqlBuilder } from '../sql-builder';
import { getDurationSql } from './event.service';

export type IProfileMetrics = {
  lastSeen: string;
  firstSeen: string;
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
};
export function getProfileMetrics(profileId: string, projectId: string) {
  return chQuery<IProfileMetrics>(`
    WITH lastSeen AS (
      SELECT max(created_at) as lastSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    firstSeen AS (
      SELECT min(created_at) as firstSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    screenViews AS (
      SELECT count(*) as screenViews FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    sessionsCount AS (
      SELECT count(*) as sessions FROM ${TABLE_NAMES.events} WHERE name = 'session_start' AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    sessionDuration AS (
      SELECT 
        avg(duration) / 1000 as durationAvg, 
        quantilesExactInclusive(0.9)(duration)[1] / 1000 as durationP90 
      FROM ${TABLE_NAMES.sessions} 
      WHERE profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
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
      SELECT round((SELECT totalEvents FROM totalEvents) / nullIf((SELECT sessions FROM sessionsCount), 0), 2) as avgEventsPerSession
    ),
    conversionEvents AS (
      SELECT count(*) as conversionEvents FROM ${TABLE_NAMES.events} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND profile_id = ${sqlstring.escape(profileId)} AND project_id = ${sqlstring.escape(projectId)}
    ),
    avgTimeBetweenSessions AS (
      SELECT 
        CASE 
          WHEN (SELECT sessions FROM sessionsCount) <= 1 THEN 0
          ELSE round(dateDiff('second', (SELECT firstSeen FROM firstSeen), (SELECT lastSeen FROM lastSeen)) / nullIf((SELECT sessions FROM sessionsCount) - 1, 0), 1)
        END as avgTimeBetweenSessions
    )
    SELECT 
      (SELECT lastSeen FROM lastSeen) as lastSeen, 
      (SELECT firstSeen FROM firstSeen) as firstSeen, 
      (SELECT screenViews FROM screenViews) as screenViews, 
      (SELECT sessions FROM sessionsCount) as sessions, 
      (SELECT durationAvg FROM sessionDuration) as durationAvg, 
      (SELECT durationP90 FROM sessionDuration) as durationP90,
      (SELECT totalEvents FROM totalEvents) as totalEvents,
      (SELECT uniqueDaysActive FROM uniqueDaysActive) as uniqueDaysActive,
      (SELECT bounceRate FROM bounceRate) as bounceRate,
      (SELECT avgEventsPerSession FROM avgEventsPerSession) as avgEventsPerSession,
      (SELECT conversionEvents FROM conversionEvents) as conversionEvents,
      (SELECT avgTimeBetweenSessions FROM avgTimeBetweenSessions) as avgTimeBetweenSessions
  `).then((data) => data[0]!);
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
    FROM ${TABLE_NAMES.profiles} FINAL WHERE id = ${sqlstring.escape(String(id))} AND project_id = ${sqlstring.escape(projectId)} GROUP BY id, project_id ORDER BY created_at DESC LIMIT 1`,
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
      any(created_at) as created_at
    FROM ${TABLE_NAMES.profiles}
    WHERE 
      project_id = ${sqlstring.escape(projectId)} AND
      id IN (${filteredIds.map((id) => sqlstring.escape(id)).join(',')})
    GROUP BY id, project_id
    `,
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

export type IServiceProfile = {
  id: string;
  email: string;
  avatar: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  isExternal: boolean;
  projectId: string;
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
};

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
    createdAt: new Date(created_at),
    projectId: profile.project_id,
    id: profile.id,
    email: profile.email,
    avatar: profile.avatar,
  };
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
  }: IServiceUpsertProfile,
  isFromEvent = false,
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
  };

  return profileBuffer.add(profile, isFromEvent);
}
