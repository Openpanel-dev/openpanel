import { PagesService, ch, getSettingsForProject } from '@openpanel/db';
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

const pagesService = new PagesService(ch);

const DEFAULT_PERFORMANCE_LIMIT = 25;
const MAX_PERFORMANCE_LIMIT = 500;

/**
 * Thresholds the tool used to stamp onto every row as a `seo_signals` object of
 * three booleans. They're pure functions of `bounce_rate` and `avg_duration`,
 * both of which are already columns — so we state the rule once instead of
 * re-deriving it 25 times at ~50 tokens a row.
 */
const SEO_THRESHOLDS = {
  high_bounce: 'bounce_rate > 70',
  low_engagement: 'avg_duration < 1 (minutes)',
  good_landing_page: 'bounce_rate < 40 AND avg_duration > 2',
} as const;

export function registerPagePerformanceTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_page_performance',
    `Get per-page performance metrics including bounce rate, avg session duration (minutes), sessions, and pageviews. Sort by bounce_rate to find high-bounce landing pages, or by avg_duration to find low-engagement content. Essential for SEO and CRO analysis. Returns the top ${DEFAULT_PERFORMANCE_LIMIT} pages; apply the returned \`seo_thresholds\` yourself to classify each row.`,
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
      limit: zLimit(DEFAULT_PERFORMANCE_LIMIT, MAX_PERFORMANCE_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, search, sortBy, sortOrder, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
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

        return {
          seo_thresholds: SEO_THRESHOLDS,
          // Only sessions and pageviews roll up: bounce_rate and avg_duration
          // are ratios, and summing them would produce a confident lie.
          ...table(sorted, {
            limit: limit ?? DEFAULT_PERFORMANCE_LIMIT,
            columns: ['path', 'title', 'sessions', 'pageviews', 'bounce_rate', 'avg_duration'],
            sum: ['sessions', 'pageviews'],
            sortedBy: col,
            unit: 'pages',
          }),
        };
      }),
  );
}
