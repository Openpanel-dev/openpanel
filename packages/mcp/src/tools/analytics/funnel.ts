import { resolveClientProjectId, getFunnelCore } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerFunnelTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_funnel',
    'Analyze a conversion funnel between 2 or more events. Returns step-by-step conversion rates and drop-off percentages. For example, analyze sign-up flows, checkout funnels, or onboarding sequences.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      steps: z
        .array(z.string())
        .min(2)
        .max(10)
        .describe(
          'Ordered list of event names forming the funnel steps (minimum 2, maximum 10)',
        ),
      windowHours: z
        .number()
        .min(1)
        .max(720)
        .default(24)
        .optional()
        .describe(
          'Time window in hours within which all steps must occur (default: 24 hours)',
        ),
      groupBy: z
        .enum(['session_id', 'profile_id'])
        .default('session_id')
        .optional()
        .describe(
          '"session_id" counts within-session completions, "profile_id" counts cross-session completions (default: session_id)',
        ),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, steps, windowHours, groupBy }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getFunnelCore({
          projectId,
          startDate,
          endDate,
          steps,
          windowHours,
          groupBy,
        });
      }),
  );
}
