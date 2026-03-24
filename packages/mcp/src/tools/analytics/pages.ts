import {
  OverviewService,
  ch,
  getSettingsForProject,
} from '@openpanel/db';
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

const overviewService = new OverviewService(ch);

export async function getTopPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  return overviewService.getTopPages({
    projectId: input.projectId,
    filters: [],
    startDate: input.startDate,
    endDate: input.endDate,
    timezone,
  });
}

export async function getEntryExitPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  mode: 'entry' | 'exit';
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  return overviewService.getTopEntryExit({
    projectId: input.projectId,
    filters: [],
    startDate: input.startDate,
    endDate: input.endDate,
    mode: input.mode,
    timezone,
  });
}

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
