import { getGscQueryDetails, getGscQueries } from '@openpanel/db';
import type { GscQueryOpportunity } from '@openpanel/db';
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
const DEFAULT_DETAIL_PAGES = 25;
const DEFAULT_OPPORTUNITY_LIMIT = 25;
const MAX_OPPORTUNITY_LIMIT = 200;

/** `ctr` and `position` are averages — only the counts can be summed. */
const GSC_ADDITIVE = ['clicks', 'impressions'] as const;

function computeOpportunities(
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>,
  limit: number,
): GscQueryOpportunity[] {
  const ctrBenchmarks: Record<string, number> = {
    '1': 0.28,
    '2': 0.15,
    '3': 0.11,
    '4-6': 0.065,
    '7-10': 0.035,
    '11-20': 0.012,
  };

  function getBenchmark(position: number): number {
    if (position <= 1) return ctrBenchmarks['1'] ?? 0.28;
    if (position <= 2) return ctrBenchmarks['2'] ?? 0.15;
    if (position <= 3) return ctrBenchmarks['3'] ?? 0.11;
    if (position <= 6) return ctrBenchmarks['4-6'] ?? 0.065;
    if (position <= 10) return ctrBenchmarks['7-10'] ?? 0.035;
    return ctrBenchmarks['11-20'] ?? 0.012;
  }

  return queries
    .filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= 50)
    .map((q) => {
      const benchmark = getBenchmark(q.position);
      const ctrGap = Math.max(0, benchmark - q.ctr);
      const opportunity_score =
        Math.round(q.impressions * (1 / q.position) * (1 + ctrGap) * 100) /
        100;

      let reason: string;
      if (q.position <= 6) {
        reason = `Position ${q.position.toFixed(1)} — one rank improvement could significantly boost clicks`;
      } else if (q.ctr < benchmark * 0.5) {
        reason = `CTR (${(q.ctr * 100).toFixed(1)}%) is well below expected ${(benchmark * 100).toFixed(1)}% — title/meta optimization may help`;
      } else {
        reason = `Position ${q.position.toFixed(1)} with ${q.impressions} impressions — push to page 1 for major gains`;
      }

      return {
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        ctr: Math.round(q.ctr * 10000) / 100,
        position: Math.round(q.position * 10) / 10,
        opportunity_score,
        reason,
      };
    })
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, limit);
}

export function registerGscQueryTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'gsc_get_top_queries',
    `Get the top search queries driving traffic from Google Search, ranked by clicks. Includes impressions, CTR, and average position for each query. Returns the top ${DEFAULT_GSC_LIMIT}; the tail is aggregated into a trailing "(other)" row for clicks and impressions.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: zLimit(DEFAULT_GSC_LIMIT, MAX_GSC_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        // Fetch the full ranked set (capped) so the tail can be rolled up
        // rather than silently cut.
        const queries = await getGscQueries(projectId, startDate, endDate, MAX_GSC_LIMIT);
        return table(queries, {
          limit: limit ?? DEFAULT_GSC_LIMIT,
          columns: ['query', 'clicks', 'impressions', 'ctr', 'position'],
          sum: [...GSC_ADDITIVE],
          sortedBy: 'clicks',
          unit: 'queries',
        });
      }),
  );

  server.tool(
    'gsc_get_query_opportunities',
    `Identify low-hanging-fruit SEO opportunities: queries ranking on positions 4-20 with meaningful search volume where small improvements could yield significant traffic gains. Ranked by opportunity score. Returns the top ${DEFAULT_OPPORTUNITY_LIMIT}.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      minImpressions: z
        .number()
        .min(1)
        .default(50)
        .optional()
        .describe(
          'Minimum impression threshold to filter out low-volume queries (default: 50)',
        ),
      limit: zLimit(DEFAULT_OPPORTUNITY_LIMIT, MAX_OPPORTUNITY_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, minImpressions, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const take = limit ?? DEFAULT_OPPORTUNITY_LIMIT;
        const queries = await getGscQueries(projectId, startDate, endDate, 5000);
        const filtered = queries.filter(
          (q) => q.impressions >= (minImpressions ?? 50),
        );
        // Compute one past the limit so the table can flag that more exist.
        const opportunities = computeOpportunities(filtered, take + 1);
        return {
          total_analyzed: filtered.length,
          min_impressions: minImpressions ?? 50,
          ...table(opportunities.slice(0, take), {
            limit: take,
            columns: ['query', 'clicks', 'impressions', 'ctr', 'position', 'opportunity_score', 'reason'],
            sortedBy: 'opportunity_score',
            unit: 'opportunities',
            moreAvailable: opportunities.length > take,
          }),
        };
      }),
  );

  server.tool(
    'gsc_get_query_details',
    'Get detailed Search Console data for a specific search query: a time-series of performance plus the pages that rank for that query.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      query: z
        .string()
        .describe('The search query to get details for (e.g. "best analytics tools")'),
      limit: zLimit(DEFAULT_DETAIL_PAGES, MAX_GSC_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, query, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const details = await getGscQueryDetails(projectId, query, startDate, endDate);
        return {
          query,
          timeseries: table(details.timeseries, {
            limit: MAX_TIMESERIES_POINTS,
            columns: ['date', 'clicks', 'impressions', 'ctr', 'position'],
            sortedBy: 'date',
            unit: 'days',
          }),
          pages: table(details.pages, {
            limit: limit ?? DEFAULT_DETAIL_PAGES,
            columns: ['page', 'clicks', 'impressions', 'ctr', 'position'],
            sum: [...GSC_ADDITIVE],
            sortedBy: 'clicks',
            unit: 'pages',
          }),
        };
      }),
  );
}
