import { getGscQueryDetails, getGscQueries } from '@openpanel/db';
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

export interface GscQueryOpportunity {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  opportunity_score: number;
  reason: string;
}

/**
 * Identify low-hanging-fruit queries:
 * - Position between 4-20 (ranking but not on page 1 top 3)
 * - Reasonable impression volume (signal of real search demand)
 * - CTR below benchmark for that position (room to improve)
 *
 * Opportunity score = impressions * (1 / position) — higher is better
 */
function computeOpportunities(
  queries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>,
): GscQueryOpportunity[] {
  // Expected CTR benchmarks by position bucket
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
    .slice(0, 50);
}

export async function gscGetTopQueriesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  return getGscQueries(
    input.projectId,
    input.startDate,
    input.endDate,
    input.limit ?? 100,
  );
}

export async function gscGetQueryOpportunitiesCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  minImpressions?: number;
}) {
  const queries = await getGscQueries(
    input.projectId,
    input.startDate,
    input.endDate,
    5000,
  );
  const filtered = queries.filter(
    (q) => q.impressions >= (input.minImpressions ?? 50),
  );
  const opportunities = computeOpportunities(filtered);
  return {
    opportunities,
    total_analyzed: filtered.length,
    min_impressions: input.minImpressions ?? 50,
  };
}

export async function gscGetQueryDetailsCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  query: string;
}) {
  return getGscQueryDetails(
    input.projectId,
    input.query,
    input.startDate,
    input.endDate,
  );
}

export function registerGscQueryTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'gsc_get_top_queries',
    'Get the top search queries driving traffic from Google Search, ranked by clicks. Includes impressions, CTR, and average position for each query.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      limit: z
        .number()
        .min(1)
        .max(1000)
        .default(100)
        .optional()
        .describe('Maximum number of queries to return (1-1000, default 100)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, limit }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getGscQueries(projectId, startDate, endDate, limit ?? 100);
      }),
  );

  server.tool(
    'gsc_get_query_opportunities',
    'Identify low-hanging-fruit SEO opportunities: queries ranking on positions 4-20 with meaningful search volume where small improvements could yield significant traffic gains. Ranked by opportunity score.',
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
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, minImpressions }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const queries = await getGscQueries(projectId, startDate, endDate, 5000);
        const filtered = queries.filter(
          (q) => q.impressions >= (minImpressions ?? 50),
        );
        const opportunities = computeOpportunities(filtered);
        return {
          opportunities,
          total_analyzed: filtered.length,
          min_impressions: minImpressions ?? 50,
        };
      }),
  );

  server.tool(
    'gsc_get_query_details',
    'Get detailed Search Console data for a specific search query: time-series performance plus all pages that rank for that query.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      query: z
        .string()
        .describe('The search query to get details for (e.g. "best analytics tools")'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, query }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getGscQueryDetails(projectId, query, startDate, endDate);
      }),
  );
}
