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
      AND deleted = 0
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
    'deleted = 0',
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
    OFFSET ${Math.max(0, (cursor ?? 0) * take)}
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
    'deleted = 0',
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
      AND deleted = 0
  `);
  return rows.map((r) => r.type);
}

export async function createGroup(input: IServiceUpsertGroup) {
  await upsertGroup(input);
  return getGroupById(input.id, input.projectId);
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
  const mergedProperties = {
    ...(existing.properties ?? {}),
    ...(data.properties ?? {}),
  };
  const normalizedProperties = toDots(
    mergedProperties as Record<string, unknown>
  );
  const updated = {
    id,
    projectId,
    type: data.type ?? existing.type,
    name: data.name ?? existing.name,
    properties: normalizedProperties,
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
      AND deleted = 0
  `);
  return rows.map((r) => r.key).sort();
}

export type IServiceGroupStats = {
  groupId: string;
  memberCount: number;
  lastActiveAt: Date | null;
};

export async function getGroupStats(
  projectId: string,
  groupIds: string[]
): Promise<Map<string, IServiceGroupStats>> {
  if (groupIds.length === 0) {
    return new Map();
  }

  const escapedIds = groupIds.map((id) => sqlstring.escape(id)).join(',');

  // Member count is derived from the **profiles** table so that it
  // matches exactly what the "Members" tab on a group detail page
  // shows. Previously we were counting distinct `profile_id`s from
  // events instead, which produced a smaller number than the members
  // list itself (profiles with a group assignment but no tagged events
  // were missing) — making the two views disagree.
  //
  // `lastActiveAt` still comes from events because that's a genuine
  // activity signal, not a membership one.
  const [memberRows, activityRows] = await Promise.all([
    chQuery<{ group_id: string; member_count: number }>(`
      SELECT
        g AS group_id,
        count() AS member_count
      FROM ${TABLE_NAMES.profiles} FINAL
      ARRAY JOIN groups AS g
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND g IN (${escapedIds})
      GROUP BY g
    `),
    chQuery<{ group_id: string; last_active_at: string }>(`
      SELECT
        g AS group_id,
        max(created_at) AS last_active_at
      FROM ${TABLE_NAMES.events}
      ARRAY JOIN groups AS g
      WHERE project_id = ${sqlstring.escape(projectId)}
        AND g IN (${escapedIds})
      GROUP BY g
    `),
  ]);

  const activityByGroup = new Map(
    activityRows.map((r) => [r.group_id, r.last_active_at]),
  );

  const result = new Map<string, IServiceGroupStats>();
  for (const id of groupIds) {
    result.set(id, {
      groupId: id,
      memberCount: 0,
      lastActiveAt: null,
    });
  }
  for (const row of memberRows) {
    const existing = result.get(row.group_id);
    if (existing) {
      existing.memberCount = row.member_count;
    }
  }
  for (const [groupId, lastActive] of activityByGroup) {
    const existing = result.get(groupId);
    if (existing && lastActive) {
      existing.lastActiveAt = new Date(lastActive);
    }
  }
  return result;
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

  const rows = await chQuery<{ id: string; total_count: number }>(`
    SELECT
      id,
      count() OVER () AS total_count
    FROM ${TABLE_NAMES.profiles} FINAL
    WHERE project_id = ${sqlstring.escape(projectId)}
      AND has(groups, ${sqlstring.escape(groupId)})
      ${searchCondition}
    ORDER BY created_at DESC
    LIMIT ${take}
    OFFSET ${offset}
  `);

  const count = rows[0]?.total_count ?? 0;
  const profileIds = rows.map((r) => r.id);

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

export async function listGroupTypesCore(projectId: string) {
  const types = await getGroupTypes(projectId);
  return { types };
}

export async function findGroupsCore(input: {
  projectId: string;
  type?: string;
  search?: string;
  limit?: number;
}) {
  return getGroupList({
    projectId: input.projectId,
    type: input.type,
    search: input.search,
    take: input.limit ?? 20,
  });
}

export async function getGroupCore(input: {
  projectId: string;
  groupId: string;
  memberLimit?: number;
}) {
  const [group, members] = await Promise.all([
    getGroupById(input.groupId, input.projectId),
    getGroupMemberProfiles({
      projectId: input.projectId,
      groupId: input.groupId,
      take: input.memberLimit ?? 10,
    }),
  ]);

  if (!group) {
    throw new Error(`Group not found: ${input.groupId}`);
  }

  return {
    group,
    member_count: members.count,
    members: members.data,
  };
}
