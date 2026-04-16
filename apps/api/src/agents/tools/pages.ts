import { z } from 'zod';
import {
  getEntryExitPagesCore,
  getPageConversionsCore,
  getPagePerformanceCore,
  getTopPagesCore,
} from '@openpanel/db';
import { chatTool, previousPeriod, resolveDateRange, truncateRows } from './helpers';

export const getPagePerformance = chatTool(
  {
    name: 'get_page_performance',
    description:
      'Per-page performance metrics with SEO signal flags (high bounce, low engagement, good landing page). Sortable by sessions, pageviews, bounce_rate, or avg_duration.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
      sortBy: z
        .enum(['sessions', 'pageviews', 'bounce_rate', 'avg_duration'])
        .default('sessions')
        .optional(),
      sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
      limit: z.number().min(1).max(500).default(50).optional(),
    }),
  },
  async (input, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: input.startDate ?? context.pageContext?.filters?.startDate,
      endDate: input.endDate ?? context.pageContext?.filters?.endDate,
    });
    return getPagePerformanceCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      search: input.search,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      limit: input.limit ?? 50,
    });
  },
);

export const getPageConversions = chatTool(
  {
    name: 'get_page_conversions',
    description:
      'For a given conversion event, find which pages drive the most conversions. Includes conversion rate per page.',
    schema: z.object({
      conversionEvent: z
        .string()
        .describe('The conversion event name (e.g. "signup", "purchase")'),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      windowHours: z.number().min(1).max(720).default(24).optional(),
      limit: z.number().min(1).max(500).default(50).optional(),
    }),
  },
  async (input, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: input.startDate ?? context.pageContext?.filters?.startDate,
      endDate: input.endDate ?? context.pageContext?.filters?.endDate,
    });
    const rows = await getPageConversionsCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      conversionEvent: input.conversionEvent,
      windowHours: input.windowHours,
      limit: input.limit ?? 50,
    });
    return truncateRows(rows, 100);
  },
);

export const getEntryExitPages = chatTool(
  {
    name: 'get_entry_exit_pages',
    description:
      'Top entry pages or top exit pages — useful for understanding where users start and where they bounce.',
    schema: z.object({
      mode: z.enum(['entry', 'exit']),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  async ({ mode, startDate, endDate }, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: startDate ?? context.pageContext?.filters?.startDate,
      endDate: endDate ?? context.pageContext?.filters?.endDate,
    });
    const rows = await getEntryExitPagesCore({
      projectId: context.projectId,
      startDate: range.startDate,
      endDate: range.endDate,
      mode,
    });
    return truncateRows(rows, 50);
  },
);

export const findDecliningPages = chatTool(
  {
    name: 'find_declining_pages',
    description:
      'Find pages where pageview volume dropped vs the immediately preceding period of the same length. Returns each declining page with absolute and percent change.',
    schema: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      minPageviews: z
        .number()
        .min(1)
        .default(50)
        .optional()
        .describe('Filter out pages with fewer than N pageviews in the previous period'),
    }),
  },
  async (input, context) => {
    const range = resolveDateRange({
      ...context.pageContext?.filters,
      startDate: input.startDate ?? context.pageContext?.filters?.startDate,
      endDate: input.endDate ?? context.pageContext?.filters?.endDate,
    });
    const prev = previousPeriod(range.startDate, range.endDate);

    const [current, previous] = await Promise.all([
      getTopPagesCore({
        projectId: context.projectId,
        startDate: range.startDate,
        endDate: range.endDate,
        limit: 500,
      }),
      getTopPagesCore({
        projectId: context.projectId,
        startDate: prev.startDate,
        endDate: prev.endDate,
        limit: 500,
      }),
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: pages shape varies between engines
    const currMap = new Map<string, any>(
      (current as Array<{ name?: string; path?: string }>).map((p) => [
        String(p.name ?? p.path),
        p,
      ]),
    );
    const min = input.minPageviews ?? 50;
    const declines = (previous as Array<{ name?: string; path?: string; count?: number; sessions?: number }>)
      .filter((p) => (p.count ?? p.sessions ?? 0) >= min)
      .map((p) => {
        const key = String(p.name ?? p.path);
        const curr = currMap.get(key);
        const prevCount = Number(p.count ?? p.sessions ?? 0);
        const currCount = Number(curr?.count ?? curr?.sessions ?? 0);
        const delta = currCount - prevCount;
        const pct = prevCount > 0 ? (delta / prevCount) * 100 : 0;
        return { path: key, previous: prevCount, current: currCount, delta, percent_change: Number(pct.toFixed(1)) };
      })
      .filter((row) => row.delta < 0)
      .sort((a, b) => a.percent_change - b.percent_change);

    return truncateRows(declines, 50);
  },
);
