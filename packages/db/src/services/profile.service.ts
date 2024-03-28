import { escape } from 'sqlstring';

import { toDots, toObject } from '@openpanel/common';
import type { IChartEventFilter } from '@openpanel/validation';

import { ch, chQuery } from '../clickhouse-client';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';

export async function getProfileById(id: string) {
  if (id === '') {
    return null;
  }

  const [profile] = await chQuery<IClickhouseProfile>(
    `SELECT *, created_at as max_created_at FROM profiles WHERE id = ${escape(id)} ORDER BY created_at DESC LIMIT 1`
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
}

function getProfileSelectFields() {
  return [
    'id',
    'argMax(first_name, created_at) as first_name',
    'argMax(last_name, created_at) as last_name',
    'argMax(email, created_at) as email',
    'argMax(avatar, created_at) as avatar',
    'argMax(properties, created_at) as properties',
    'argMax(project_id, created_at) as project_id',
    'max(created_at) as max_created_at',
  ].join(', ');
}

interface GetProfilesOptions {
  ids: string[];
}
export async function getProfiles({ ids }: GetProfilesOptions) {
  if (ids.length === 0) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    `SELECT 
    ${getProfileSelectFields()}
    FROM profiles 
    WHERE id IN (${ids.map((id) => escape(id)).join(',')})
    GROUP BY id
    `
  );

  return data.map(transformProfile);
}

function getProfileInnerSelect(projectId: string) {
  return `(SELECT 
    ${getProfileSelectFields()}
    FROM profiles 
    GROUP BY id
    HAVING project_id = ${escape(projectId)})`;
}

export async function getProfileList({
  take,
  cursor,
  projectId,
  filters,
}: GetProfileListOptions) {
  const { sb, getSql } = createSqlBuilder();
  sb.from = getProfileInnerSelect(projectId);
  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }
  sb.limit = take;
  sb.offset = Math.max(0, (cursor ?? 0) * take);
  sb.orderBy.created_at = 'max_created_at DESC';
  const data = await chQuery<IClickhouseProfile>(getSql());
  return data.map(transformProfile);
}

export async function getProfileListCount({
  projectId,
  filters,
}: Omit<GetProfileListOptions, 'cursor' | 'take'>) {
  const { sb, getSql } = createSqlBuilder();
  sb.select.count = 'count(id) as count';
  sb.from = getProfileInnerSelect(projectId);
  if (filters) {
    sb.where = {
      ...sb.where,
      ...getEventFiltersWhereClause(filters),
    };
  }
  const [data] = await chQuery<{ count: number }>(getSql());
  return data?.count ?? 0;
}

export async function getProfilesByExternalId(
  externalId: string | null,
  projectId: string
) {
  if (externalId === null) {
    return [];
  }

  const data = await chQuery<IClickhouseProfile>(
    `SELECT 
    ${getProfileSelectFields()}
    FROM profiles 
    GROUP BY id
    HAVING project_id = ${escape(projectId)} AND external_id = ${escape(externalId)}
    `
  );

  return data.map(transformProfile);
}

export type IServiceProfile = Omit<
  IClickhouseProfile,
  'max_created_at' | 'properties' | 'first_name' | 'last_name'
> & {
  firstName: string;
  lastName: string;
  createdAt: Date;
  properties: Record<string, unknown> & {
    country?: string;
    city?: string;
    os?: string;
    os_version?: string;
    browser?: string;
    browser_version?: string;
    referrer_name?: string;
    referrer_type?: string;
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
  max_created_at: string;
}

export interface IServiceUpsertProfile {
  projectId: string;
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  properties?: Record<string, unknown>;
}

function transformProfile({
  max_created_at,
  first_name,
  last_name,
  ...profile
}: IClickhouseProfile): IServiceProfile {
  return {
    ...profile,
    firstName: first_name,
    lastName: last_name,
    properties: toObject(profile.properties),
    createdAt: new Date(max_created_at),
  };
}

export async function upsertProfile({
  id,
  firstName,
  lastName,
  email,
  avatar,
  properties,
  projectId,
}: IServiceUpsertProfile) {
  const [profile] = await chQuery<IClickhouseProfile>(
    `SELECT * FROM profiles WHERE id = ${escape(id)} AND project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT 1`
  );

  await ch.insert({
    table: 'profiles',
    format: 'JSONEachRow',
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
    },
    values: [
      {
        id,
        first_name: firstName ?? profile?.first_name ?? '',
        last_name: lastName ?? profile?.last_name ?? '',
        email: email ?? profile?.email ?? '',
        avatar: avatar ?? profile?.avatar ?? '',
        properties: toDots({
          ...(profile?.properties ?? {}),
          ...(properties ?? {}),
        }),
        project_id: projectId ?? profile?.project_id ?? '',
        created_at: new Date(),
      },
    ],
  });
}
