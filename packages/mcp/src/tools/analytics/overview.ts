import {
  OverviewService,
  ch,
  getSettingsForProject,
} from '@openpanel/db';
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

const overviewService = new OverviewService(ch);

export interface GetAnalyticsOverviewInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval?: 'hour' | 'day' | 'week' | 'month';
}

export async function getAnalyticsOverviewCore(
  input: GetAnalyticsOverviewInput,
) {
  const { timezone } = await getSettingsForProject(input.projectId);
  const interval = input.interval ?? 'day';

  const result = await overviewService.getMetrics({
    projectId: input.projectId,
    filters: [],
    startDate: input.startDate,
    endDate: input.endDate,
    interval,
    timezone,
  });

  return {
    summary: result.metrics,
    series: result.series,
    interval,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export function registerOverviewTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_analytics_overview',
    'Get key analytics metrics for a date range: unique visitors, total pageviews, sessions, bounce rate, average session duration, and views per session. Optionally includes a time-series breakdown by interval.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      interval: z
        .enum(['hour', 'day', 'week', 'month'])
        .default('day')
        .optional()
        .describe('Time interval for the series breakdown (default: day)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, interval }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getAnalyticsOverviewCore({
          projectId,
          startDate,
          endDate,
          interval,
        });
      }),
  );
}
