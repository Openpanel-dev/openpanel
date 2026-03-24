import {
  getGroupById,
  getGroupList,
  getGroupMemberProfiles,
  getGroupTypes,
} from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { projectIdSchema, resolveProjectId, withErrorHandling } from '../shared';

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
        const projectId = resolveProjectId(context, inputProjectId);
        const types = await getGroupTypes(projectId);
        return { types };
      }),
  );

  server.tool(
    'find_groups',
    'Search for groups (companies, teams, accounts) by name, ID, or type. Groups are B2B entities that profiles (users) belong to.',
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
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Maximum number of groups to return (default 20)'),
    },
    async ({ projectId: inputProjectId, type, search, limit }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        return getGroupList({ projectId, type, search, take: limit ?? 20 });
      }),
  );

  server.tool(
    'get_group',
    'Get a specific group by ID including its properties, and fetch the member profiles (users) that belong to it.',
    {
      projectId: projectIdSchema(context),
      groupId: z.string().describe('The group ID to look up'),
      memberLimit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .optional()
        .describe('Max number of member profiles to include (default 10)'),
    },
    async ({ projectId: inputProjectId, groupId, memberLimit }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const [group, members] = await Promise.all([
          getGroupById(groupId, projectId),
          getGroupMemberProfiles({
            projectId,
            groupId,
            take: memberLimit ?? 10,
          }),
        ]);

        if (!group) {
          return { error: 'Group not found', groupId };
        }

        return {
          group,
          member_count: members.count,
          members: members.data,
        };
      }),
  );
}
