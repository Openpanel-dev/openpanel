import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSettingsForProject } from '../../../../organization/organization.service';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_PERFORMANCE_LIMIT = 25;
const MAX_PERFORMANCE_LIMIT = 500;
/**
 * Rows fetched before sorting in memory. The service sorts by sessions only,
 * so every other `sortBy` needs a wide enough head to re-rank — at the cost
 * of reading rows the caller will never see.
 */
const PAGE_SCAN_LIMIT = 1000;

/**
 * Thresholds for high bounce, low engagement and good landing pages. They are
 * pure functions of `bounce_rate` and `avg_duration`, so the rule is stated once
 * instead of re-derived on every row.
 */
const SEO_THRESHOLDS = {
  high_bounce: 'bounce_rate > 70',
  low_engagement: 'avg_duration < 1 (minutes)',
  good_landing_page: 'bounce_rate < 40 AND avg_duration > 2',
} as const;

export function registerPagePerformanceTools(
  server: McpServer,
  { context, deps, services }: McpToolDeps
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
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      search,
      sortBy,
      sortOrder,
      limit,
    }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const { timezone } = await getSettingsForProject(deps, projectId);
        const pages = await services.pages.getTopPages({
          projectId,
          startDate,
          endDate,
          timezone,
          search,
          limit: PAGE_SCAN_LIMIT,
        });

        const col = sortBy ?? 'sessions';
        const dir = sortOrder === 'asc' ? 1 : -1;
        // Ties must compare 0. A comparator that answers "greater" for equal
        // values violates the contract and leaves tied rows in an
        // engine-dependent order.
        const sorted = [...pages].sort((a, b) => {
          const left = a[col] ?? 0;
          const right = b[col] ?? 0;
          if (left === right) {
            return 0;
          }
          return dir * (left < right ? -1 : 1);
        });

        return {
          seo_thresholds: SEO_THRESHOLDS,
          // Only sessions and pageviews roll up: bounce_rate and avg_duration
          // are ratios, and summing them would produce a confident lie.
          ...table(sorted, {
            limit: limit ?? DEFAULT_PERFORMANCE_LIMIT,
            columns: [
              'path',
              'title',
              'sessions',
              'pageviews',
              'bounce_rate',
              'avg_duration',
            ],
            sum: ['sessions', 'pageviews'],
            sortedBy: col,
            unit: 'pages',
          }),
        };
      })
  );
}
