import { tool } from 'ai';
import { z } from 'zod';
import {
  gscGetCannibalizationCore,
  gscGetOverviewCore,
  gscGetQueryOpportunitiesCore,
  gscGetTopPagesCore,
  gscGetTopQueriesCore,
} from '../../../gsc/gsc.service';
import type { ChatToolContext } from '../context';
import { resolveRange, toDateOnly, truncateRows } from './shared';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const zOptionalRange = {
  startDate: z.string().optional().describe('YYYY-MM-DD'),
  endDate: z.string().optional().describe('YYYY-MM-DD'),
};

export function seoTools(ctx: ChatToolContext) {
  const { deps, projectId } = ctx;
  // GSC stores plain dates; datetime bounds are refused.
  const gscRange = (input: { startDate?: string; endDate?: string }) => {
    const range = resolveRange(ctx, input);
    return {
      startDate: toDateOnly(range.startDate),
      endDate: toDateOnly(range.endDate),
    };
  };

  return {
    gsc_overview: tool({
      description:
        'Google Search Console totals and trend: clicks, impressions, CTR and average position. Needs the GSC integration; an error means it is not connected.',
      inputSchema: z.object({
        ...zOptionalRange,
        interval: z.enum(['day', 'week', 'month']).default('day'),
      }),
      execute: ({ startDate, endDate, interval }) =>
        gscGetOverviewCore(deps, {
          projectId,
          ...gscRange({ startDate, endDate }),
          interval,
        }),
    }),

    gsc_top_queries: tool({
      description:
        'Top Google search queries by clicks with impressions, CTR and position.',
      inputSchema: z.object({
        ...zOptionalRange,
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
      }),
      execute: async ({ startDate, endDate, limit }) =>
        truncateRows(
          await gscGetTopQueriesCore(deps, {
            projectId,
            ...gscRange({ startDate, endDate }),
            limit,
          }),
          limit
        ),
    }),

    gsc_top_pages: tool({
      description:
        'Top pages in Google search by clicks with impressions, CTR and position.',
      inputSchema: z.object({
        ...zOptionalRange,
        limit: z.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
      }),
      execute: async ({ startDate, endDate, limit }) =>
        truncateRows(
          await gscGetTopPagesCore(deps, {
            projectId,
            ...gscRange({ startDate, endDate }),
            limit,
          }),
          limit
        ),
    }),

    gsc_opportunities: tool({
      description:
        'Queries with many impressions but a weak position or CTR: the quickest SEO wins.',
      inputSchema: z.object({
        ...zOptionalRange,
        minImpressions: z.number().int().min(1).optional(),
      }),
      execute: ({ startDate, endDate, minImpressions }) =>
        gscGetQueryOpportunitiesCore(deps, {
          projectId,
          ...gscRange({ startDate, endDate }),
          minImpressions,
        }),
    }),

    gsc_cannibalization: tool({
      description:
        'Queries where several of your pages compete against each other in Google.',
      inputSchema: z.object(zOptionalRange),
      execute: ({ startDate, endDate }) =>
        gscGetCannibalizationCore(deps, {
          projectId,
          ...gscRange({ startDate, endDate }),
        }),
    }),
  };
}
