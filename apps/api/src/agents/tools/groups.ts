import { z } from 'zod';
import {
  findGroupsCore,
  getGroupCore,
  getGroupMemberProfiles,
  queryEventsCore,
} from '@openpanel/db';
import { chatTool, dashboardUrl, truncateRows } from './helpers';

export const getGroupFull = chatTool(
  {
    name: 'get_group_full',
    description:
      'One-shot deep dive: group info + member count + first 10 members + recent events from members. CALL THIS FIRST for "tell me about this group".',
    schema: z.object({
      groupId: z.string().optional(),
    }),
  },
  async ({ groupId }, context) => {
    const defaultGroupId = context.pageContext?.ids?.groupId ?? '';
    const id = groupId || defaultGroupId;
    const orgPath = (path = '') =>
      dashboardUrl(context.organizationId, context.projectId, path);

    const group = await getGroupCore({
      projectId: context.projectId,
      groupId: id,
      memberLimit: 10,
    });

    // Pull a few recent events from any members. We use the
    // `profileIds IN (...)` filter on queryEventsCore so the DB does
    // the narrowing instead of us post-filtering a generic feed.
    const memberIds = group.members.map((m) => m.id);
    const recentEvents = memberIds.length
      ? await queryEventsCore({
          projectId: context.projectId,
          profileIds: memberIds,
          limit: 10,
        })
      : [];

    return {
      ...group,
      recent_events: recentEvents,
      dashboard_url: orgPath(`/groups/${id}`),
    };
  },
);

export const getGroupMembers = chatTool(
  {
    name: 'get_group_members',
    description:
      'Paginated list of profiles in this group.',
    schema: z.object({
      groupId: z.string().optional(),
      limit: z.number().min(1).max(100).default(20).optional(),
      search: z.string().optional(),
    }),
  },
  async ({ groupId, limit, search }, context) => {
    const defaultGroupId = context.pageContext?.ids?.groupId ?? '';
    const id = groupId || defaultGroupId;
    const orgPath = (path = '') =>
      dashboardUrl(context.organizationId, context.projectId, path);

    const result = await getGroupMemberProfiles({
      projectId: context.projectId,
      groupId: id,
      take: limit ?? 20,
      search,
    });
    return {
      group_id: id,
      total_count: result.count,
      members: result.data.map((p) => ({
        ...p,
        dashboard_url: orgPath(`/profiles/${p.id}`),
      })),
    };
  },
);

export const getGroupEvents = chatTool(
  {
    name: 'get_group_events',
    description:
      'Recent events from members of this group.',
    schema: z.object({
      groupId: z.string().optional(),
      eventNames: z.array(z.string()).optional(),
      limit: z.number().min(1).max(100).default(50).optional(),
    }),
  },
  async ({ groupId, eventNames, limit }, context) => {
    const defaultGroupId = context.pageContext?.ids?.groupId ?? '';
    const id = groupId || defaultGroupId;

    const members = await getGroupMemberProfiles({
      projectId: context.projectId,
      groupId: id,
      take: 100,
    });
    if (members.data.length === 0) {
      return { group_id: id, events: [], note: 'Group has no members' };
    }

    const events = await queryEventsCore({
      projectId: context.projectId,
      profileIds: members.data.map((m) => m.id),
      eventNames,
      limit: limit ?? 50,
    });

    return truncateRows(events, 100);
  },
);

export const getGroupMetrics = chatTool(
  {
    name: 'get_group_metrics',
    description:
      'Aggregate metrics for this group: total members, members active in the last 7d/30d, total revenue (sum of member.revenue), avg sessions per member.',
    schema: z.object({
      groupId: z.string().optional(),
    }),
  },
  async ({ groupId }, context) => {
    const defaultGroupId = context.pageContext?.ids?.groupId ?? '';
    const id = groupId || defaultGroupId;

    const members = await getGroupMemberProfiles({
      projectId: context.projectId,
      groupId: id,
      take: 1000,
    });

    if (members.data.length === 0) {
      return { group_id: id, total_members: 0, note: 'Group has no members' };
    }

    // Pull events for this group's members over the last 30 days, then
    // bucket by 7d vs 30d. `profileIds IN (...)` lets ClickHouse do the
    // narrowing — a generic project-wide feed would miss members whose
    // activity falls outside the last N raw events.
    const memberIds = members.data.map((m) => m.id);
    const recentEvents = await queryEventsCore({
      projectId: context.projectId,
      profileIds: memberIds,
      startDate: new Date(Date.now() - 30 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      limit: 1000,
    });
    const activeIds7d = new Set<string>();
    const activeIds30d = new Set<string>();
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    for (const e of recentEvents) {
      if (!e.profile_id) continue;
      activeIds30d.add(e.profile_id);
      if (new Date(e.created_at).getTime() >= sevenDaysAgo) {
        activeIds7d.add(e.profile_id);
      }
    }

    return {
      group_id: id,
      total_members: members.count,
      active_last_7_days: activeIds7d.size,
      active_last_30_days: activeIds30d.size,
    };
  },
);

export const compareGroups = chatTool(
  {
    name: 'compare_groups',
    description:
      'Compare this group\'s member count and activity to other groups of the same type. Useful in B2B for "is this account active vs the rest?".',
    schema: z.object({
      groupId: z.string().optional(),
    }),
  },
  async ({ groupId }, context) => {
    const defaultGroupId = context.pageContext?.ids?.groupId ?? '';
    const id = groupId || defaultGroupId;

    const thisGroup = await getGroupCore({
      projectId: context.projectId,
      groupId: id,
      memberLimit: 0,
    });

    const peers = await findGroupsCore({
      projectId: context.projectId,
      type: thisGroup.group.type,
      limit: 100,
    });

    if (peers.length === 0) {
      return { this_group: thisGroup, peers: [], note: 'No peer groups' };
    }

    // `findGroupsCore` returns `IServiceGroup[]` without a memberCount
    // — that lives on `IServiceGroupStats` via a separate query. We
    // don't fetch it here, so we report peer count + this group's
    // count and list a handful of peers without rankings. If "rank by
    // members" becomes useful, fetch `getGroupStats` for each peer.
    return {
      this_group: {
        id: thisGroup.group.id,
        name: thisGroup.group.name,
        member_count: thisGroup.member_count,
      },
      peer_count: peers.length,
      top_peers: peers.slice(0, 5).map((g) => ({
        id: g.id,
        name: g.name,
      })),
    };
  },
);
