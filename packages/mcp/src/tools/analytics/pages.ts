import { getEntryExitPagesCore, getTopPagesCore } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_PAGE_LIMIT = 25;
const MAX_PAGE_LIMIT = 500;

type PageRow = {
  origin: string;
  path: string;
  sessions: number;
  pageviews: number;
  revenue?: number;
};

/**
 * Both page queries push their limit into ClickHouse, so we can't count the
 * tail to roll it up. Fetch one extra row instead: its presence is enough to
 * tell the model the list is capped, which stops it reporting "you have 25
 * pages" for a site with three thousand.
 */
function pageTable(rows: PageRow[], limit: number) {
  const hasRevenue = rows.some((row) => row.revenue !== undefined);
  return table(rows.slice(0, limit), {
    limit,
    columns: ['path', 'origin', 'sessions', 'pageviews', ...(hasRevenue ? (['revenue'] as const) : [])],
    sortedBy: 'sessions',
    unit: 'pages',
    moreAvailable: rows.length > limit,
  });
}

export function registerPageTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'get_top_pages',
    `Get the most visited pages ranked by sessions, with pageview counts. Defaults to the top ${DEFAULT_PAGE_LIMIT} pages.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: zLimit(DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const take = limit ?? DEFAULT_PAGE_LIMIT;
        const rows = await getTopPagesCore({
          projectId,
          startDate,
          endDate,
          limit: take + 1,
        });
        return pageTable(rows as PageRow[], take);
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
      limit: zLimit(DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT),
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
        const take = limit ?? DEFAULT_PAGE_LIMIT;
        const rows = await getEntryExitPagesCore({
          projectId,
          startDate,
          endDate,
          mode,
          limit: take + 1,
        });
        return { mode, ...pageTable(rows as PageRow[], take) };
      }),
  );
}
