import { resolveClientProjectId, PagesService, ch, getSettingsForProject } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
} from '../shared';

const pagesService = new PagesService(ch);

export function registerPagePerformanceTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_page_performance',
    'Get per-page performance metrics including bounce rate, avg session duration, sessions, and pageviews. Sort by bounce_rate to find high-bounce landing pages, or by avg_duration to find low-engagement content. Essential for SEO and CRO analysis.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      search: z
        .string()
        .optional()
        .describe('Filter pages by path or title (partial match)'),
      sortBy: z
        .enum(['sessions', 'pageviews', 'bounce_rate', 'avg_duration'])
        .default('sessions')
        .optional()
        .describe('Sort results by this metric (default: sessions)'),
      sortOrder: z
        .enum(['asc', 'desc'])
        .default('desc')
        .optional()
        .describe('Sort direction (default: desc)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .optional()
        .describe('Maximum number of pages to return (default 50)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, search, sortBy, sortOrder, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const { timezone } = await getSettingsForProject(projectId);

        const pages = await pagesService.getTopPages({
          projectId,
          startDate,
          endDate,
          timezone,
          search,
          limit: 1000, // fetch more, sort+slice in memory for flexibility
        });

        const col = sortBy ?? 'sessions';
        const dir = sortOrder === 'asc' ? 1 : -1;
        const sorted = [...pages].sort((a, b) => dir * ((a[col] ?? 0) < (b[col] ?? 0) ? -1 : 1));
        const results = sorted.slice(0, limit ?? 50);

        // Annotate with SEO signals
        const annotated = results.map((p) => ({
          ...p,
          seo_signals: {
            high_bounce: p.bounce_rate > 70,
            low_engagement: p.avg_duration < 1,
            good_landing_page: p.bounce_rate < 40 && p.avg_duration > 2,
          },
        }));

        return {
          total_pages: pages.length,
          shown: annotated.length,
          pages: annotated,
        };
      }),
  );
}
