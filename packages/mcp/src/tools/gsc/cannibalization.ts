import { getGscCannibalization } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerGscCannibalizationTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'gsc_get_cannibalization',
    'Identify keyword cannibalization: search queries where multiple pages on your site compete against each other in Google. Returns queries where 2+ pages rank, sorted by total impressions. High cannibalization can hurt rankings.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getGscCannibalization(projectId, startDate, endDate);
      }),
  );
}
