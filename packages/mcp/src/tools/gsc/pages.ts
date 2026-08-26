import { getGscPageDetails, getGscPages } from '@openpanel/db';
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

const DEFAULT_GSC_LIMIT = 25;
const MAX_GSC_LIMIT = 1000;
const MAX_TIMESERIES_POINTS = 180;
const DEFAULT_DETAIL_QUERIES = 25;

/**
 * `ctr` and `position` are averages — summing them across a rolled-up tail
 * would produce a confident lie, so only the two counts are additive.
 */
const GSC_ADDITIVE = ['clicks', 'impressions'] as const;

export function registerGscPageTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'gsc_get_top_pages',
    `Get the top-performing pages from Google Search Console, ranked by clicks. Includes impressions, CTR, and average position for each page. Returns the top ${DEFAULT_GSC_LIMIT}; the tail is aggregated into a trailing "(other)" row for clicks and impressions.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: zLimit(DEFAULT_GSC_LIMIT, MAX_GSC_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const take = limit ?? DEFAULT_GSC_LIMIT;
        // Fetch the full ranked set (capped) so the tail can be rolled up
        // rather than silently cut — GSC totals are the whole point here.
        const pages = await getGscPages(projectId, startDate, endDate, MAX_GSC_LIMIT);
        return table(pages, {
          limit: take,
          columns: ['page', 'clicks', 'impressions', 'ctr', 'position'],
          sum: [...GSC_ADDITIVE],
          sortedBy: 'clicks',
          unit: 'pages',
        });
      }),
  );

  server.tool(
    'gsc_get_page_details',
    'Get detailed Search Console performance for a specific page: a time-series of clicks/impressions/CTR/position plus the queries that drive traffic to that page.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      page: z
        .string()
        .url()
        .describe('The full page URL to get details for (e.g. https://example.com/blog/post)'),
      limit: zLimit(DEFAULT_DETAIL_QUERIES, MAX_GSC_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, page, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const details = await getGscPageDetails(projectId, page, startDate, endDate);
        return {
          page,
          timeseries: table(details.timeseries, {
            limit: MAX_TIMESERIES_POINTS,
            columns: ['date', 'clicks', 'impressions', 'ctr', 'position'],
            sortedBy: 'date',
            unit: 'days',
          }),
          queries: table(details.queries, {
            limit: limit ?? DEFAULT_DETAIL_QUERIES,
            columns: ['query', 'clicks', 'impressions', 'ctr', 'position'],
            sum: [...GSC_ADDITIVE],
            sortedBy: 'clicks',
            unit: 'queries',
          }),
        };
      }),
  );
}
