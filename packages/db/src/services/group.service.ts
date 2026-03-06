import { toDots } from '@openpanel/common';
import sqlstring from 'sqlstring';
import {
  ch,
  chQuery,
  formatClickhouseDate,
  TABLE_NAMES,
} from '../clickhouse/client';
import type { IServiceProfile } from './profile.service';
import { getProfiles } from './profile.service';

export type IServiceGroup = {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type IServiceUpsertGroup = {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
};

type IClickhouseGroup = {
  project_id: string;
  id: string;
  type: string;
  name: string;
  properties: Record<string, string>;
  created_at: string;
  version: string;
};

function transformGroup(row: IClickhouseGroup): IServiceGroup {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    name: row.name,
    properties: row.properties,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(Number(row.version)),
  };
}

async function writeGroupToCh(
  group: {
    id: string;
    projectId: string;
    type: string;
    name: string;
    properties: Record<string, string>;
    createdAt?: Date;
  },
  deleted = 0
) {
  await ch.insert({
    format: 'JSONEachRow',
    table: TABLE_NAMES.groups,
    values: [
      {
        project_id: group.projectId,
        id: group.id,
        type: group.type,
        name: group.name,
        properties: group.properties,
        created_at: formatClickhouseDate(group.createdAt ?? new Date()),
        version: Date.now(),
        deleted,
      },
    ],
  });
}

export async function upsertGroup(input: IServiceUpsertGroup) {
  const existing = await getGroupById(input.id, input.projectId);
  await writeGroupToCh({
    id: input.id,
    projectId: input.projectId,
    type: input.type,
    name: input.name,
    properties: toDots({
      ...(existing?.properties ?? {}),
      ...(input.properties ?? {}),
    }),
    createdAt: existing?.createdAt,
  });
}

export async function getGroupById(
  id: string,
  projectId: string
): Promise<IServiceGroup | null> {
  const rows = await chQuery<IClickhouseGroup>(`
    SELECT project_id, id, type, name, properties, created_at, version
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND id = ${sqlstring.escape(id)}
  `);
  return rows[0] ? transformGroup(rows[0]) : null;
}

export async function getGroupList({
  projectId,
  cursor,
  take,
  search,
  type,
}: {
  projectId: string;
  cursor?: number;
  take: number;
  search?: string;
  type?: string;
}): Promise<IServiceGroup[]> {
  const conditions = [
    `project_id = ${sqlstring.escape(projectId)}`,
    ...(type ? [`type = ${sqlstring.escape(type)}`] : []),
    ...(search
      ? [
          `(name ILIKE ${sqlstring.escape(`%${search}%`)} OR id ILIKE ${sqlstring.escape(`%${search}%`)})`,
        ]
      : []),
  ];

  const rows = await chQuery<IClickhouseGroup>(`
    SELECT project_id, id, type, name, properties, created_at, version
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ${take}
    OFFSET ${cursor ?? 0}
  `);
  return rows.map(transformGroup);
}

export async function getGroupListCount({
  projectId,
  type,
  search,
}: {
  projectId: string;
  type?: string;
  search?: string;
}): Promise<number> {
  const conditions = [
    `project_id = ${sqlstring.escape(projectId)}`,
    ...(type ? [`type = ${sqlstring.escape(type)}`] : []),
    ...(search
      ? [
          `(name ILIKE ${sqlstring.escape(`%${search}%`)} OR id ILIKE ${sqlstring.escape(`%${search}%`)})`,
        ]
      : []),
  ];

  const rows = await chQuery<{ count: number }>(`
    SELECT count() as count
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE ${conditions.join(' AND ')}
  `);
  return rows[0]?.count ?? 0;
}

export async function getGroupTypes(projectId: string): Promise<string[]> {
  const rows = await chQuery<{ type: string }>(`
    SELECT DISTINCT type
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
  `);
  return rows.map((r) => r.type);
}

export async function createGroup(input: IServiceUpsertGroup) {
  const { id, projectId, type, name, properties = {} } = input;
  await writeGroupToCh({
    id,
    projectId,
    type,
    name,
    properties: properties as Record<string, string>,
    createdAt: new Date(),
  });
  return getGroupById(id, projectId);
}

export async function updateGroup(
  id: string,
  projectId: string,
  data: { type?: string; name?: string; properties?: Record<string, unknown> }
) {
  const existing = await getGroupById(id, projectId);
  if (!existing) {
    throw new Error(`Group ${id} not found`);
  }
  const updated = {
    id,
    projectId,
    type: data.type ?? existing.type,
    name: data.name ?? existing.name,
    properties: (data.properties ?? existing.properties) as Record<
      string,
      string
    >,
    createdAt: existing.createdAt,
  };
  await writeGroupToCh(updated);
  return { ...existing, ...updated };
}

export async function deleteGroup(id: string, projectId: string) {
  const existing = await getGroupById(id, projectId);
  if (!existing) {
    throw new Error(`Group ${id} not found`);
  }
  await writeGroupToCh(
    {
      id,
      projectId,
      type: existing.type,
      name: existing.name,
      properties: existing.properties as Record<string, string>,
      createdAt: existing.createdAt,
    },
    1
  );
  return existing;
}

export async function getGroupPropertyKeys(
  projectId: string
): Promise<string[]> {
  const rows = await chQuery<{ key: string }>(`
    SELECT DISTINCT arrayJoin(mapKeys(properties)) as key
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
  `);
  return rows.map((r) => r.key).sort();
}

export async function getGroupsByIds(
  projectId: string,
  ids: string[]
): Promise<IServiceGroup[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await chQuery<IClickhouseGroup>(`
    SELECT project_id, id, type, name, properties, created_at, version
    FROM ${TABLE_NAMES.groups} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND id IN (${ids.map((id) => sqlstring.escape(id)).join(',')})
      AND deleted = 0
  `);
  return rows.map(transformGroup);
}

export async function getGroupMemberProfiles({
  projectId,
  groupId,
  cursor,
  take,
  search,
}: {
  projectId: string;
  groupId: string;
  cursor?: number;
  take: number;
  search?: string;
}): Promise<{ data: IServiceProfile[]; count: number }> {
  const offset = Math.max(0, (cursor ?? 0) * take);
  const searchCondition = search?.trim()
    ? `AND (email ILIKE ${sqlstring.escape(`%${search.trim()}%`)} OR first_name ILIKE ${sqlstring.escape(`%${search.trim()}%`)} OR last_name ILIKE ${sqlstring.escape(`%${search.trim()}%`)})`
    : '';

  const countResult = await chQuery<{ count: number }>(`
    SELECT count() AS count
    FROM (
      SELECT profile_id
      FROM ${TABLE_NAMES.events}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND has(groups, ${sqlstring.escape(groupId)})
        AND profile_id != device_id
      GROUP BY profile_id
    ) gm
    INNER JOIN (
      SELECT id FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}
      ${searchCondition}
    ) p ON p.id = gm.profile_id
  `);
  const count = countResult[0]?.count ?? 0;

  const idRows = await chQuery<{ profile_id: string }>(`
    SELECT gm.profile_id
    FROM (
      SELECT profile_id, max(created_at) AS last_seen
      FROM ${TABLE_NAMES.events}
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND has(groups, ${sqlstring.escape(groupId)})
        AND profile_id != device_id
      GROUP BY profile_id
      ORDER BY last_seen DESC
    ) gm
    INNER JOIN (
      SELECT id FROM ${TABLE_NAMES.profiles} FINAL
      WHERE project_id = ${sqlstring.escape(projectId)}
      ${searchCondition}
    ) p ON p.id = gm.profile_id
    ORDER BY gm.last_seen DESC
    LIMIT ${take}
    OFFSET ${offset}
  `);
  const profileIds = idRows.map((r) => r.profile_id);
  if (profileIds.length === 0) {
    return { data: [], count };
  }
  const profiles = await getProfiles(profileIds, projectId);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const data = profileIds
    .map((id) => byId.get(id))
    .filter(Boolean) as IServiceProfile[];
  return { data, count };
}
