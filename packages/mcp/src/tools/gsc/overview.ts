import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveClientProjectId, getGscOverview } from '@openpanel/db';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerGscOverviewTools(
  server: McpServer,
  context: McpAuthContext
) {
  server.tool(
    'gsc_get_overview',
    'Get Google Search Console performance over time: clicks, impressions, CTR, and average position. Requires GSC to be connected for the project.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      interval: z
        .enum(['day', 'week', 'month'])
        .default('day')
        .optional()
        .describe('Time interval for aggregation (default: day)'),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      interval,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const data = await getGscOverview(
          projectId,
          startDate,
          endDate,
          interval ?? 'day'
        );
        return {
          data,
          summary: {
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
                    (data.reduce((s, r) => s + r.position, 0) / data.length) *
                      10
                  ) / 10
                : 0,
          },
        };
      })
  );
}
