import {
  getRollingActiveUsers,
  getRetentionSeries,
} from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export function registerActiveUserTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_rolling_active_users',
    'Get a time series of unique active users using a rolling window. Use days=1 for DAU, days=7 for WAU, days=30 for MAU. Shows how your active user count trends over time.',
    {
      projectId: projectIdSchema(context),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .describe('Rolling window in days. 1 = DAU, 7 = WAU, 30 = MAU.'),
    },
    async ({ projectId: inputProjectId, days }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const data = await getRollingActiveUsers({ projectId, days });
        return {
          window_days: days,
          label: days === 1 ? 'DAU' : days === 7 ? 'WAU' : days === 30 ? 'MAU' : `${days}d active`,
          series: data,
        };
      }),
  );

  server.tool(
    'get_weekly_retention_series',
    'Get week-over-week user retention as a time series. For each week, shows how many users were active that week and how many returned the following week. Useful for understanding whether your product retains users.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        return getRetentionSeries({ projectId });
      }),
  );
}
