import { resolveClientProjectId, getRetentionCohortTable } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  
  withErrorHandling,
} from '../shared';

export function registerRetentionTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_retention_cohort',
    'Get a weekly user retention cohort table. Shows what percentage of users who first visited in a given week returned in subsequent weeks. Useful for understanding long-term user engagement and product stickiness.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        return getRetentionCohortTable({ projectId });
      }),
  );
}
