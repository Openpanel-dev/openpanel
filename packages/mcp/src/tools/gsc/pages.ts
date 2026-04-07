import { getGscPageDetails, getGscPages } from '@openpanel/db';
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

export async function gscGetTopPagesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  return getGscPages(
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100,
  );
}

export async function gscGetPageDetailsCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  page: string;
}) {
  return getGscPageDetails(
    input.projectId,
    input.page,
    input.startDate,
    input.endDate,
  );
}

export function registerGscPageTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'gsc_get_top_pages',
    'Get the top-performing pages from Google Search Console, ranked by clicks. Includes impressions, CTR, and average position for each page.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: z
        .number()
        .min(1)
        .max(1000)
        .default(100)
        .optional()
        .describe('Maximum number of pages to return (1-1000, default 100)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getGscPages(projectId, startDate, endDate, limit ?? 100);
      }),
  );

  server.tool(
    'gsc_get_page_details',
    'Get detailed Search Console performance for a specific page: time-series of clicks/impressions/CTR/position plus all queries that drive traffic to that page.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      page: z
        .string()
        .url()
        .describe('The full page URL to get details for (e.g. https://example.com/blog/post)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, page }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getGscPageDetails(projectId, page, startDate, endDate);
      }),
  );
}
