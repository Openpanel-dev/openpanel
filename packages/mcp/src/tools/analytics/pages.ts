import { getEntryExitPagesCore, getTopPagesCore } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
  resolveProjectId
} from '../shared';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 500;

export function registerPageTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'get_top_pages',
    `Get the most visited pages ranked by page views, with unique visitor counts and other engagement metrics. Defaults to the top ${DEFAULT_PAGE_LIMIT} pages.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_LIMIT)
        .optional()
        .describe(
          `Max pages to return (default ${DEFAULT_PAGE_LIMIT}, max ${MAX_PAGE_LIMIT}). Lower this if you're hitting response-size limits.`,
        ),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getTopPagesCore({
          projectId,
          startDate,
          endDate,
          limit: limit ?? DEFAULT_PAGE_LIMIT,
        });
      }),
  );

  server.tool(
    'get_entry_exit_pages',
    `Get the most common entry pages (first page in a session) or exit pages (last page in a session). Defaults to the top ${DEFAULT_PAGE_LIMIT} pages.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      mode: z
        .enum(['entry', 'exit'])
        .describe(
          '"entry" for pages visitors land on first, "exit" for pages they leave from',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGE_LIMIT)
        .optional()
        .describe(
          `Max pages to return (default ${DEFAULT_PAGE_LIMIT}, max ${MAX_PAGE_LIMIT}). Lower this if you're hitting response-size limits.`,
        ),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      mode,
      limit,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getEntryExitPagesCore({
          projectId,
          startDate,
          endDate,
          mode,
          limit: limit ?? DEFAULT_PAGE_LIMIT,
        });
      }),
  );
}
