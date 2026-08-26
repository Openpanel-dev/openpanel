import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGscCannibalization } from '@openpanel/db';
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

// Cap pages per query in the MCP response. The core function keeps the
// full list for the UI, but feeding every page into an LLM blows the
// response size for sites with heavy cannibalization (100KB+).
const DEFAULT_PAGES_PER_QUERY = 5;
const MAX_PAGES_PER_QUERY = 20;
const DEFAULT_QUERY_LIMIT = 25;
/** The core function already caps its own output at 50 queries. */
const MAX_QUERY_LIMIT = 50;

/** Column order for the nested per-page tuples, declared once for the response. */
const PAGE_COLUMNS = ['page', 'clicks', 'impressions', 'ctr', 'position'] as const;

export function registerGscCannibalizationTools(
  server: McpServer,
  context: McpAuthContext
) {
  server.tool(
    'gsc_get_cannibalization',
    `Identify keyword cannibalization: search queries where multiple pages on your site compete against each other in Google. Returns queries where 2+ pages rank, sorted by total impressions. Each row's \`pages\` cell is a list of tuples in the order given by the top-level \`page_columns\`, capped at the top ${DEFAULT_PAGES_PER_QUERY} pages by position. High cannibalization can hurt rankings.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      pagesPerQuery: zLimit(DEFAULT_PAGES_PER_QUERY, MAX_PAGES_PER_QUERY),
      limit: zLimit(DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      pagesPerQuery,
      limit,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const pageCap = pagesPerQuery ?? DEFAULT_PAGES_PER_QUERY;
        const rows = await getGscCannibalization(projectId, startDate, endDate);

        // Positional tuples rather than page objects: the five keys are stated
        // once in `page_columns` instead of on every page of every query.
        const shaped = rows.map((row) => ({
          query: row.query,
          totalImpressions: row.totalImpressions,
          totalClicks: row.totalClicks,
          page_count: row.pages.length,
          pages: row.pages
            .slice(0, pageCap)
            .map((page) => PAGE_COLUMNS.map((column) => page[column])),
        }));

        return {
          page_columns: PAGE_COLUMNS,
          ...table(shaped, {
            limit: limit ?? DEFAULT_QUERY_LIMIT,
            columns: ['query', 'totalImpressions', 'totalClicks', 'page_count', 'pages'],
            sum: ['totalImpressions', 'totalClicks'],
            sortedBy: 'totalImpressions',
            unit: 'queries',
          }),
        };
      })
  );
}
