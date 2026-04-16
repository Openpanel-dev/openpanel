import { z } from 'zod';
import {
  getTopPagesCore,
  gscGetCannibalizationCore,
  gscGetOverviewCore,
  gscGetPageDetailsCore,
  gscGetQueryDetailsCore,
  gscGetQueryOpportunitiesCore,
  gscGetTopPagesCore,
  gscGetTopQueriesCore,
} from '@openpanel/db';
import { chatTool, resolveDateRange, truncateRows } from './helpers';

export const gscGetOverview = chatTool(
  {
    name: 'gsc_get_overview',
    description:
      'GSC performance over time — clicks, impressions, CTR, average position. Returns a daily/weekly/monthly time series plus totals.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      interval: z.enum(['day', 'week', 'month']).default('day').optional(),
    }),
  },
  async ({ startDate, endDate, interval }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    return gscGetOverviewCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      interval,
    });
  },
);

export const gscGetTopQueries = chatTool(
  {
    name: 'gsc_get_top_queries',
    description:
      'Top search queries by clicks. Returns query, clicks, impressions, CTR, position.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(50).optional(),
    }),
  },
  async ({ startDate, endDate, limit }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    const rows = await gscGetTopQueriesCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: limit ?? 50,
    });
    return truncateRows(rows, 100);
  },
);

export const gscGetTopPages = chatTool(
  {
    name: 'gsc_get_top_pages',
    description:
      'Top pages by GSC clicks. Returns page URL, clicks, impressions, CTR, position.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(50).optional(),
    }),
  },
  async ({ startDate, endDate, limit }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    const rows = await gscGetTopPagesCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      limit: limit ?? 50,
    });
    return truncateRows(rows, 100);
  },
);

export const gscGetQueryDetails = chatTool(
  {
    name: 'gsc_get_query_details',
    description:
      'Time-series + page list for a single query. Use after gsc_get_top_queries to drill into one query.',
    schema: z.object({
      query: z.string(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ query, startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    return gscGetQueryDetailsCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      query,
    });
  },
);

export const gscGetPageDetails = chatTool(
  {
    name: 'gsc_get_page_details',
    description:
      'Time-series + ranking queries for a single page URL. Use after gsc_get_top_pages.',
    schema: z.object({
      page: z.string().describe('Full page URL'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ page, startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    return gscGetPageDetailsCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      page,
    });
  },
);

export const gscGetQueryOpportunities = chatTool(
  {
    name: 'gsc_get_query_opportunities',
    description:
      'Find low-hanging SEO fruit — queries ranking position 4-20 with high impressions but low clicks. Returns each opportunity with a score and reason.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      minImpressions: z.number().min(1).default(50).optional(),
    }),
  },
  async ({ startDate, endDate, minImpressions }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    return gscGetQueryOpportunitiesCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      minImpressions,
    });
  },
);

export const gscGetCannibalization = chatTool(
  {
    name: 'gsc_get_cannibalization',
    description:
      'Find queries where multiple pages from the same site compete for the same ranking. Each result shows the query and the competing pages.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    return gscGetCannibalizationCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
    });
  },
);

export const correlateSeoWithTraffic = chatTool(
  {
    name: 'correlate_seo_with_traffic',
    description:
      'Combine GSC clicks with OpenPanel session data per page. Identifies pages with high SEO traffic but poor conversion (high bounce or low engagement). Run this when the user wants to know "which SEO pages aren\'t converting".',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(100).default(30).optional(),
    }),
  },
  async ({ startDate, endDate, limit }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });

    const [gscPages, opPages] = await Promise.all([
      gscGetTopPagesCore({
        projectId: context.projectId,
        startDate: range.startDate,
        endDate: range.endDate,
        limit: 200,
      }),
      getTopPagesCore({
        projectId: context.projectId,
        startDate: range.startDate,
        endDate: range.endDate,
        limit: 200,
      }),
    ]);

    // The OP `getTopPagesCore` and GSC `gscGetTopPagesCore` return
    // different row shapes — the fields we actually read are captured
    // in these local types, keeping the lookup map typed.
    type OpPage = {
      name?: string;
      path?: string;
      sessions?: number;
      bounce_rate?: number;
      avg_duration?: number;
    };
    type GscPage = {
      page: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    };

    const opByPath = new Map<string, OpPage>();
    for (const p of opPages as OpPage[]) {
      const key = String(p.name ?? p.path ?? '');
      opByPath.set(key, p);
      opByPath.set(key.replace(/\/$/, ''), p);
    }

    const correlated = (gscPages as GscPage[])
      .map((g) => {
        const pathOnly = g.page.replace(/^https?:\/\/[^/]+/, '');
        const op =
          opByPath.get(pathOnly) ?? opByPath.get(pathOnly.replace(/\/$/, ''));
        return {
          page: g.page,
          gsc_clicks: g.clicks,
          gsc_impressions: g.impressions,
          gsc_ctr: g.ctr,
          gsc_position: g.position,
          op_sessions: op?.sessions ?? null,
          op_bounce_rate: op?.bounce_rate ?? null,
          op_avg_duration: op?.avg_duration ?? null,
          underperforming:
            (op?.bounce_rate ?? 0) > 70 || (op?.avg_duration ?? 99) < 1,
        };
      })
      .sort((a, b) => b.gsc_clicks - a.gsc_clicks);

    return truncateRows(correlated, limit ?? 30);
  },
);
