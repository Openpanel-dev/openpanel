import { getGroupById, getGroupList, getGroupMemberProfiles, getGroupTypes } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zLimit,
} from '../shared';

const DEFAULT_GROUP_LIMIT = 20;
const MAX_GROUP_LIMIT = 100;
const DEFAULT_MEMBER_LIMIT = 10;
const MAX_MEMBER_LIMIT = 50;

const GROUP_COLUMNS = ['id', 'type', 'name', 'createdAt', 'properties'] as const;
const MEMBER_COLUMNS = ['id', 'firstName', 'lastName', 'email', 'lastSeenAt'] as const;

export function registerGroupTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_group_types',
    'List all group types defined in this project (e.g. "company", "team", "account"). Groups represent B2B entities. Call this first to discover what group types exist before querying groups.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const types = await getGroupTypes(projectId);
        return { types };
      }),
  );

  server.tool(
    'find_groups',
    `Search for groups (companies, teams, accounts) by name, ID, or type. Groups are B2B entities that profiles (users) belong to. Defaults to ${DEFAULT_GROUP_LIMIT} groups.`,
    {
      projectId: projectIdSchema(context),
      type: z
        .string()
        .optional()
        .describe('Filter by group type (e.g. "company", "team"). Use list_group_types to discover available types.'),
      search: z
        .string()
        .optional()
        .describe('Partial match against group name or ID'),
      limit: zLimit(DEFAULT_GROUP_LIMIT, MAX_GROUP_LIMIT),
    },
    async ({ projectId: inputProjectId, type, search, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = limit ?? DEFAULT_GROUP_LIMIT;
        const groups = await getGroupList({ projectId, type, search, take: take + 1 });
        return table(groups.slice(0, take), {
          limit: take,
          columns: GROUP_COLUMNS,
          unit: 'groups',
          moreAvailable: groups.length > take,
        });
      }),
  );

  server.tool(
    'get_group',
    'Get a specific group by ID including its properties, and fetch the member profiles (users) that belong to it.',
    {
      projectId: projectIdSchema(context),
      groupId: z.string().describe('The group ID to look up'),
      memberLimit: zLimit(DEFAULT_MEMBER_LIMIT, MAX_MEMBER_LIMIT),
    },
    async ({ projectId: inputProjectId, groupId, memberLimit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = memberLimit ?? DEFAULT_MEMBER_LIMIT;
        const [group, members] = await Promise.all([
          getGroupById(groupId, projectId),
          getGroupMemberProfiles({
            projectId,
            groupId,
            take,
          }),
        ]);

        if (!group) {
          return { error: 'Group not found', groupId };
        }

        return {
          group,
          member_count: members.count,
          members: table(members.data, {
            limit: take,
            columns: MEMBER_COLUMNS,
            unit: 'members',
            // `count` is the true total; the fetched page is capped at `take`.
            moreAvailable: members.count > members.data.length,
          }),
        };
      }),
  );
}
