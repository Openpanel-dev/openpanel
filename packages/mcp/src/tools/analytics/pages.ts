import { getEntryExitPagesCore, getTopPagesCore } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerPageTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'get_top_pages',
    'Get the most visited pages ranked by page views, with unique visitor counts and other engagement metrics.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getTopPagesCore({ projectId, startDate, endDate });
      }),
  );

  server.tool(
    'get_entry_exit_pages',
    'Get the most common entry pages (first page in a session) or exit pages (last page in a session).',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      mode: z
        .enum(['entry', 'exit'])
        .describe(
          '"entry" for pages visitors land on first, "exit" for pages they leave from',
        ),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, mode }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getEntryExitPagesCore({ projectId, startDate, endDate, mode });
      }),
  );
}
