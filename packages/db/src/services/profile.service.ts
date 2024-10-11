import { omit, uniq } from 'ramda';
import { escape } from 'sqlstring';

import { toObject } from '@openpanel/common';
import { cacheable } from '@openpanel/redis';
import type { IChartEventFilter } from '@openpanel/validation';

import { profileBuffer } from '../buffers';
import {
  TABLE_NAMES,
  ch,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse-client';
import { createSqlBuilder } from '../sql-builder';

export type IProfileMetrics = {
  lastSeen: string;
  firstSeen: string;
  screenViews: number;
  sessions: number;
  durationAvg: number;
  durationP90: number;
};
export function getProfileMetrics(profileId: string, projectId: string) {
  return chQuery<IProfileMetrics>(`
    WITH lastSeen AS (
      SELECT max(created_at) as lastSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)}
    ),
    firstSeen AS (
      SELECT min(created_at) as firstSeen FROM ${TABLE_NAMES.events} WHERE profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)}
    ),
    screenViews AS (
      SELECT count(*) as screenViews FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)}
    ),
    sessions AS (
      SELECT count(*) as sessions FROM ${TABLE_NAMES.events} WHERE name = 'session_start' AND profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)}
    ),
    duration AS (
      SELECT avg(duration) as durationAvg, quantilesExactInclusive(0.9)(duration)[1] as durationP90 FROM ${TABLE_NAMES.events} WHERE name = 'session_end' AND duration != 0 AND profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)}
    )
    SELECT lastSeen, firstSeen, screenViews, sessions, durationAvg, durationP90 FROM lastSeen, firstSeen, screenViews,sessions, duration
  `).then((data) => data[0]!);
}

export async function getProfileById(id: string, projectId: string) {
  if (id === '' || projectId === '') {
    return null;
  }

  const [profile] = await chQuery<IClickhouseProfile>(
    `SELECT * FROM ${TABLE_NAMES.profiles} WHERE id = ${escape(String(id))} AND project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT 1`,
  );

  if (!profile) {
    return null;
  }

  return transformProfile(profile);
}

export const getProfileByIdCached = cacheable(getProfileById, 60 * 30);

interface GetProfileListOptions {
  projectId: string;
  take: number;
  cursor?: number;
  filters?: IChartEventFilter[];
  search?: string;
}

export async function getProfiles(ids: string[], projectId: string) {
  const filteredIds = uniq(ids.filter((id) => id !== ''));

  if (filteredIds.length === 0) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    `SELECT id, first_name, last_name, email, avatar, is_external, properties, created_at
    FROM ${TABLE_NAMES.profiles} FINAL 
    WHERE 
      project_id = ${escape(projectId)} AND
      id IN (${filteredIds.map((id) => escape(id)).join(',')})
    `,
  );

  return data.map(transformProfile);
}

export async function getProfileList({
  take,
  cursor,
  projectId,
  filters,
  search,
}: GetProfileListOptions) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = `${TABLE_NAMES.profiles} FINAL`;
  sb.select.all = '*';
  sb.where.project_id = `project_id = ${escape(projectId)}`;
  sb.limit = take;
  sb.offset = Math.max(0, (cursor ?? 0) * take);
  sb.orderBy.created_at = 'created_at DESC';
  if (search) {
    sb.where.search = `(email ILIKE '%${search}%' OR first_name ILIKE '%${search}%' OR last_name ILIKE '%${search}%')`;
  }
  const data = await chQuery<IClickhouseProfile>(getSql());
  return data.map(transformProfile);
}

export async function getProfileListCount({
  projectId,
  filters,
}: Omit<GetProfileListOptions, 'cursor' | 'take'>) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = 'profiles';
  sb.select.count = 'count(id) as count';
  sb.where.project_id = `project_id = ${escape(projectId)}`;
  sb.groupBy.project_id = 'project_id';
  const data = await chQuery<{ count: number }>(getSql());
  return data[0]?.count ?? 0;
}

export type IServiceProfile = Omit<
  IClickhouseProfile,
  'created_at' | 'properties' | 'first_name' | 'last_name' | 'is_external'
> & {
  firstName: string;
  lastName: string;
  createdAt: Date;
  isExternal: boolean;
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
    ...profile,
    firstName: first_name,
    lastName: last_name,
    isExternal: profile.is_external,
    properties: profile.properties
      ? omit(['browserVersion', 'osVersion'], toObject(profile.properties))
      : {},
    createdAt: new Date(created_at),
  };
}

export async function createProfileAlias({
  projectId,
  alias,
  profileId,
}: {
  projectId: string;
  alias: string;
  profileId: string;
}) {
  await getProfileIdCached.clear({ profileId, projectId });
  await ch.insert({
    table: TABLE_NAMES.alias,
    format: 'JSONEachRow',
    values: [
      {
        projectId,
        profile_id: profileId,
        alias,
        created_at: new Date(),
      },
    ],
  });
}

export async function upsertProfile({
  id,
  firstName,
  lastName,
  email,
  avatar,
  properties,
  projectId,
  isExternal,
}: IServiceUpsertProfile) {
  return profileBuffer.add({
    id,
    first_name: firstName!,
    last_name: lastName!,
    email: email!,
    avatar: avatar!,
    properties: properties as Record<string, string | undefined>,
    project_id: projectId,
    created_at: formatClickhouseDate(new Date()),
    is_external: isExternal,
  });
}

export async function getProfileId({
  profileId,
  projectId,
}: {
  profileId: number | string | undefined;
  projectId: string;
}) {
  if (!profileId) {
    return '';
  }

  const res = await chQuery<{
    alias: string;
    profile_id: string;
    project_id: string;
  }>(
    `SELECT * FROM ${TABLE_NAMES.alias} WHERE project_id = '${projectId}' AND (alias = '${profileId}' OR profile_id = '${profileId}')`,
  );

  if (res[0]) {
    return res[0].profile_id;
  }

  return String(profileId);
}

export const getProfileIdCached = cacheable(getProfileId, 60 * 30);
