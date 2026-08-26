import { getRollingActiveUsers, getRetentionSeries } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zLimit,
} from '../shared';

/**
 * Both underlying queries return a project's entire history with no date bound,
 * so the response grows forever as the project ages. Trends are read from the
 * recent end, so we keep the most recent points and say how many we dropped.
 */
const DEFAULT_DAILY_POINTS = 90;
const MAX_DAILY_POINTS = 730;
const DEFAULT_WEEKLY_POINTS = 26;
const MAX_WEEKLY_POINTS = 260;

/** Keep the tail (most recent) rather than the head, then restore date order. */
function mostRecent<T>(rows: T[], take: number): T[] {
  return rows.length <= take ? rows : rows.slice(rows.length - take);
}

export function registerActiveUserTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_rolling_active_users',
    `Get a time series of unique active users using a rolling window. Use days=1 for DAU, days=7 for WAU, days=30 for MAU. Shows how your active user count trends over time. Returns the most recent ${DEFAULT_DAILY_POINTS} days by default.`,
    {
      projectId: projectIdSchema(context),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .describe('Rolling window in days. 1 = DAU, 7 = WAU, 30 = MAU.'),
      limit: zLimit(DEFAULT_DAILY_POINTS, MAX_DAILY_POINTS),
    },
    async ({ projectId: inputProjectId, days, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = limit ?? DEFAULT_DAILY_POINTS;
        const data = await getRollingActiveUsers({ projectId, days });
        const recent = mostRecent(data, take);
        return {
          window_days: days,
          label: days === 1 ? 'DAU' : days === 7 ? 'WAU' : days === 30 ? 'MAU' : `${days}d active`,
          ...(data.length > recent.length
            ? {
                series_note: `Showing the most recent ${recent.length} of ${data.length} days. Raise \`limit\` for more history.`,
              }
            : {}),
          series: table(recent, {
            limit: take,
            columns: ['date', 'users'],
            sortedBy: 'date',
            unit: 'days',
          }),
        };
      }),
  );

  server.tool(
    'get_weekly_retention_series',
    `Get week-over-week user retention as a time series. For each week, shows how many users were active that week and how many returned the following week. Useful for understanding whether your product retains users. Returns the most recent ${DEFAULT_WEEKLY_POINTS} weeks by default.`,
    {
      projectId: projectIdSchema(context),
      limit: zLimit(DEFAULT_WEEKLY_POINTS, MAX_WEEKLY_POINTS),
    },
    async ({ projectId: inputProjectId, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = limit ?? DEFAULT_WEEKLY_POINTS;
        const data = await getRetentionSeries({ projectId });
        const recent = mostRecent(data, take);
        return {
          ...(data.length > recent.length
            ? {
                series_note: `Showing the most recent ${recent.length} of ${data.length} weeks. Raise \`limit\` for more history.`,
              }
            : {}),
          ...table(recent, {
            limit: take,
            columns: ['date', 'active_users', 'retained_users', 'retention'],
            sortedBy: 'date',
            unit: 'weeks',
          }),
        };
      }),
  );
}
