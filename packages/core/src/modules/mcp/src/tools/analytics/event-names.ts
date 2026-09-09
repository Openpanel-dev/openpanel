import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getTopEventNames } from '../../../../event/event.service';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export function registerEventNameTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'list_event_names',
    'Get the top 50 most common event names tracked in this project. Always call this before querying events if you are unsure of the exact event name.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const names = await getTopEventNames(deps, projectId);
        return { event_names: names };
      })
  );
}
