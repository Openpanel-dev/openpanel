import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getFunnelCore } from '../../../../chart/funnel.service';
import { zTimeToConvertAggregation } from '../../../../report/report.constants';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerFunnelTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'get_funnel',
    'Analyze a conversion funnel between 2 or more events. Returns step-by-step conversion rates and drop-off percentages, and optionally how long users take to convert. For example, analyze sign-up flows, checkout funnels, or onboarding sequences.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      steps: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe(
          'Ordered list of event names forming the funnel steps (minimum 2, maximum 10)'
        ),
      windowHours: z
        .number()
        .min(1)
        .max(720)
        .default(24)
        .optional()
        .describe(
          'Time window in hours within which all steps must occur (default: 24 hours)'
        ),
      groupBy: z
        .enum(['session_id', 'profile_id'])
        .default('session_id')
        .optional()
        .describe(
          '"session_id" counts within-session completions, "profile_id" counts cross-session completions (default: session_id)'
        ),
      timeToConvert: zTimeToConvertAggregation
        .optional()
        .describe(
          'Also return time to convert, aggregated over the sessions or profiles (per groupBy) that reached each step: avg, median, min, max, or the p25/p75/p90/p99 percentile. Each step gets timeToConvertSeconds (seconds from the previous step, null on the first step) and the result gets timeToConvertSeconds from the first step to the last. Omit to leave it out.'
        ),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      steps,
      windowHours,
      groupBy,
      timeToConvert,
    }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getFunnelCore(deps, {
          projectId,
          startDate,
          endDate,
          steps,
          windowHours,
          groupBy,
          timeToConvert,
        });
      })
  );
}
