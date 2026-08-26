import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getGscOverview } from '@openpanel/db';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
} from '../shared';

/** A daily series longer than this stops being readable and starts being noise. */
const MAX_SERIES_POINTS = 180;

export function registerGscOverviewTools(
  server: McpServer,
  context: McpAuthContext
) {
  server.tool(
    'gsc_get_overview',
    'Get Google Search Console performance over time: clicks, impressions, CTR, and average position, plus totals for the range. Requires GSC to be connected for the project.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      interval: z
        .enum(['day', 'week', 'month'])
        .default('day')
        .optional()
        .describe('Time interval for aggregation (default: day)'),
      includeSeries: z
        .boolean()
        .default(true)
        .optional()
        .describe(
          'Set false to get only the summary totals and skip the per-interval series.',
        ),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      interval,
      includeSeries,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const data = await getGscOverview(
          projectId,
          startDate,
          endDate,
          interval ?? 'day'
        );
        const summary = {
          total_clicks: data.reduce((s, r) => s + r.clicks, 0),
          total_impressions: data.reduce((s, r) => s + r.impressions, 0),
          avg_ctr:
            data.length > 0
              ? Math.round(
                  (data.reduce((s, r) => s + r.ctr, 0) / data.length) * 10_000
                ) / 100
              : 0,
          avg_position:
            data.length > 0
              ? Math.round(
                  (data.reduce((s, r) => s + r.position, 0) / data.length) * 10
                ) / 10
              : 0,
        };

        if (includeSeries === false) {
          return { summary, startDate, endDate, interval: interval ?? 'day' };
        }

        // Keep the recent end of an over-long series — the summary above still
        // covers the whole range, so nothing is lost from the totals.
        const recent =
          data.length > MAX_SERIES_POINTS
            ? data.slice(data.length - MAX_SERIES_POINTS)
            : data;

        return {
          summary,
          startDate,
          endDate,
          interval: interval ?? 'day',
          ...(data.length > recent.length
            ? {
                series_note: `Showing the most recent ${recent.length} of ${data.length} intervals; \`summary\` still covers the full range. Use a coarser \`interval\` or a shorter range for full coverage.`,
              }
            : {}),
          series: table(recent, {
            limit: MAX_SERIES_POINTS,
            columns: ['date', 'clicks', 'impressions', 'ctr', 'position'],
            sortedBy: 'date',
            unit: 'intervals',
          }),
        };
      })
  );
}
