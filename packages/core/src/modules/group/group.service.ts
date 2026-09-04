// Ported from packages/db/src/services/group.service.ts plus the query bodies
// of packages/trpc/src/routers/group.ts (M7-002). The db file is now a
// re-export shim over this one, so @openpanel/db importers (the assistant/mcp
// tools, apps/api's insights controller) keep working while V1 runs
// (DELEGATE PATTERN); the trpc router delegates its handler bodies here.
//
// Every query is a `sql` fragment (src/group.sql.ts), converted one at a time
// with a result-set proof each, per ADR-013.
//
// db/ch access is LAZY (`loadChClient`) for the reason insight.service.ts's
// header gives: constructing @openpanel/db's clients at import time spawns a
// pino-pretty worker per `bun test --isolate` file.

import { toDots } from '@openpanel/common';
import type { ServiceDeps } from '../../services';
import { getProfiles, type IServiceProfile } from '../profile/profile.service';
import { formatClickhouseDate } from './src/dates';
import {
  groupActivityQuery,
  groupByIdQuery,
  groupEventMetricsQuery,
  groupListCountQuery,
  groupListQuery,
  groupMemberGrowthQuery,
  groupMemberProfilesQuery,
  groupMostEventsQuery,
  groupPopularRoutesQuery,
  groupPropertyKeysQuery,
  groupStatsQuery,
  groupsByIdsQuery,
  groupTypesQuery,
  groupUniqueProfilesQuery,
} from './src/group.sql';

const GROUPS_TABLE = 'groups';
const FIND_GROUPS_DEFAULT_LIMIT = 20;
const GROUP_MEMBERS_DEFAULT_LIMIT = 10;

function loadChClient() {
  return import('@openpanel/db/src/clickhouse/client');
}

export interface IServiceGroup {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IServiceUpsertGroup {
  id: string;
  projectId: string;
  type: string;
  name: string;
  properties?: Record<string, unknown>;
}

interface IClickhouseGroup {
  project_id: string;
  id: string;
  type: string;
  name: string;
  properties: Record<string, string>;
  created_at: string;
  version: string;
}

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

function pageOffset(cursor: number | undefined, take: number): number {
  return Math.max(0, (cursor ?? 0) * take);
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
  const { ch } = await loadChClient();
  await ch.insert({
    format: 'JSONEachRow',
    table: GROUPS_TABLE,
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
  const { chQuery } = await loadChClient();
  const rows = await chQuery<IClickhouseGroup>(
    groupByIdQuery({ id, projectId })
  );
  return rows[0] ? transformGroup(rows[0]) : null;
}

export interface GetGroupListOptions {
  projectId: string;
  cursor?: number;
  take: number;
  search?: string;
  type?: string;
}

export async function getGroupList({
  projectId,
  cursor,
  take,
  search,
  type,
}: GetGroupListOptions): Promise<IServiceGroup[]> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<IClickhouseGroup>(
    groupListQuery({
      projectId,
      take,
      offset: pageOffset(cursor, take),
      search,
      type,
    })
  );
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
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ count: number }>(
    groupListCountQuery({ projectId, type, search })
  );
  return rows[0]?.count ?? 0;
}

export async function getGroupTypes(projectId: string): Promise<string[]> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ type: string }>(groupTypesQuery(projectId));
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
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ key: string }>(
    groupPropertyKeysQuery(projectId)
  );
  return rows.map((r) => r.key).sort();
}

export interface IServiceGroupStats {
  groupId: string;
  memberCount: number;
  lastActiveAt: Date | null;
}

export async function getGroupStats(
  projectId: string,
  groupIds: string[]
): Promise<Map<string, IServiceGroupStats>> {
  if (groupIds.length === 0) {
    return new Map();
  }

  const { chQuery } = await loadChClient();
  const rows = await chQuery<{
    group_id: string;
    member_count: number;
    last_active_at: string;
  }>(groupStatsQuery({ projectId, groupIds }));

  return new Map(
    rows.map((r) => [
      r.group_id,
      {
        groupId: r.group_id,
        memberCount: r.member_count,
        lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
      },
    ])
  );
}

export async function getGroupsByIds(
  projectId: string,
  ids: string[]
): Promise<IServiceGroup[]> {
  if (ids.length === 0) {
    return [];
  }

  const { chQuery } = await loadChClient();
  const rows = await chQuery<IClickhouseGroup>(
    groupsByIdsQuery({ projectId, ids })
  );
  return rows.map(transformGroup);
}

export interface GetGroupMemberProfilesOptions {
  projectId: string;
  groupId: string;
  cursor?: number;
  take: number;
  search?: string;
}

export async function getGroupMemberProfiles({
  projectId,
  groupId,
  cursor,
  take,
  search,
}: GetGroupMemberProfilesOptions): Promise<{
  data: IServiceProfile[];
  count: number;
}> {
  const { chQuery } = await loadChClient();
  const rows = await chQuery<{ id: string; total_count: number }>(
    groupMemberProfilesQuery({
      projectId,
      groupId,
      take,
      offset: pageOffset(cursor, take),
      search: search?.trim() || undefined,
    })
  );

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

// ---- the trpc group router's bodies

/** `list`: the page plus each group's member count / last activity. */
export async function getGroupListPage(input: GetGroupListOptions) {
  const [data, count] = await Promise.all([
    getGroupList(input),
    getGroupListCount(input),
  ]);
  const stats = await getGroupStats(
    input.projectId,
    data.map((g) => g.id)
  );
  return {
    data: data.map((g) => ({
      ...g,
      memberCount: stats.get(g.id)?.memberCount ?? 0,
      lastActiveAt: stats.get(g.id)?.lastActiveAt ?? null,
    })),
    meta: { count, take: input.take },
  };
}

export async function getGroupMetrics(id: string, projectId: string) {
  const { chQuery, toNullIfDefaultMinDate } = await loadChClient();
  const [eventData, profileData] = await Promise.all([
    chQuery<{ totalEvents: number; firstSeen: string; lastSeen: string }>(
      groupEventMetricsQuery({ projectId, groupId: id })
    ),
    chQuery<{ uniqueProfiles: number }>(
      groupUniqueProfilesQuery({ projectId, groupId: id })
    ),
  ]);

  return {
    totalEvents: eventData[0]?.totalEvents ?? 0,
    uniqueProfiles: profileData[0]?.uniqueProfiles ?? 0,
    firstSeen: toNullIfDefaultMinDate(eventData[0]?.firstSeen),
    lastSeen: toNullIfDefaultMinDate(eventData[0]?.lastSeen),
  };
}

export async function getGroupActivity(id: string, projectId: string) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; date: string }>(
    groupActivityQuery({ projectId, groupId: id })
  );
}

export async function getGroupMemberGrowth(id: string, projectId: string) {
  const { chQuery } = await loadChClient();
  return chQuery<{ date: string; count: number }>(
    groupMemberGrowthQuery({ projectId, groupId: id })
  );
}

export async function getGroupMostEvents(id: string, projectId: string) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; name: string }>(
    groupMostEventsQuery({ projectId, groupId: id })
  );
}

export async function getGroupPopularRoutes(id: string, projectId: string) {
  const { chQuery } = await loadChClient();
  return chQuery<{ count: number; path: string }>(
    groupPopularRoutesQuery({ projectId, groupId: id })
  );
}

export async function getGroupMemberProfilesPage(
  input: GetGroupMemberProfilesOptions
) {
  const { data, count } = await getGroupMemberProfiles(input);
  return {
    data,
    meta: { count, pageCount: input.take },
  };
}

// ---- the assistant/mcp tool entry points

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
    take: input.limit ?? FIND_GROUPS_DEFAULT_LIMIT,
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
      take: input.memberLimit ?? GROUP_MEMBERS_DEFAULT_LIMIT,
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

export interface GroupService {
  byId(id: string, projectId: string): Promise<IServiceGroup | null>;
  upsert(input: IServiceUpsertGroup): Promise<void>;
}

export function createGroupService(_deps: ServiceDeps): GroupService {
  return {
    byId: getGroupById,
    upsert: upsertGroup,
  };
}
