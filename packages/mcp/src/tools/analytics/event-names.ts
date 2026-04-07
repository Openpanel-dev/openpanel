import { resolveClientProjectId, getTopEventNames } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  
  withErrorHandling,
} from '../shared';

export function registerEventNameTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_event_names',
    'Get the top 50 most common event names tracked in this project. Always call this before querying events if you are unsure of the exact event name.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const names = await getTopEventNames(projectId);
        return { event_names: names };
      }),
  );
}
