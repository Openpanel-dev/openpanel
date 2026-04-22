import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGscCannibalization } from '@openpanel/db';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,

  withErrorHandling,
  zDateRange,
  resolveProjectId
} from '../shared';

// Cap pages per query in the MCP response. The core function keeps the
// full list for the UI, but feeding every page into an LLM blows the
// response size for sites with heavy cannibalization (100KB+).
const DEFAULT_PAGES_PER_QUERY = 5;
const MAX_PAGES_PER_QUERY = 20;

export function registerGscCannibalizationTools(
  server: McpServer,
  context: McpAuthContext
) {
  server.tool(
    'gsc_get_cannibalization',
    `Identify keyword cannibalization: search queries where multiple pages on your site compete against each other in Google. Returns queries where 2+ pages rank, sorted by total impressions (capped at 50 queries). Each query's pages list is truncated to the top ${DEFAULT_PAGES_PER_QUERY} by position. High cannibalization can hurt rankings.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      pagesPerQuery: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGES_PER_QUERY)
        .optional()
        .describe(
          `Max pages to include per query (default ${DEFAULT_PAGES_PER_QUERY}, max ${MAX_PAGES_PER_QUERY}). Each query can rank many pages; this trims the tail to keep the response small.`,
        ),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      pagesPerQuery,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const cap = pagesPerQuery ?? DEFAULT_PAGES_PER_QUERY;
        const rows = await getGscCannibalization(projectId, startDate, endDate);
        return rows.map((row) => {
          if (row.pages.length <= cap) return row;
          return {
            ...row,
            pages: row.pages.slice(0, cap),
            pagesTruncated: true,
            totalPages: row.pages.length,
          };
        });
      })
  );
}
