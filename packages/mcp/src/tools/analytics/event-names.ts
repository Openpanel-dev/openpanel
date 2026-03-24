import { TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { IClickhouseEvent } from '@openpanel/db';
import { getCache } from '@openpanel/redis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export async function getTopEventNames(projectId: string): Promise<string[]> {
  return getCache(`mcp:event-names:${projectId}`, 60 * 10, async () => {
    const rows = await clix(ch)
      .select<IClickhouseEvent>(['name', 'count() as count'])
      .from(TABLE_NAMES.event_names_mv)
      .where('project_id', '=', projectId)
      .groupBy(['name'])
      .orderBy('count', 'DESC')
      .limit(50)
      .execute();

    return rows.map((r) => r.name);
  });
}

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
        const projectId = resolveProjectId(context, inputProjectId);
        const names = await getTopEventNames(projectId);
        return { event_names: names };
      }),
  );
}
