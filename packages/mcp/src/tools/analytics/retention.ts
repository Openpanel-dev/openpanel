import { getRetentionCohortCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  
  withErrorHandling,
  resolveProjectId
} from '../shared';

export function registerRetentionTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_retention_cohort',
    'Get a weekly active-user retention cohort for the last 12 weeks. Returns one row per cohort (the week users were first seen), each with `cohort_interval`, `sum` (cohort size), `values` (retained user counts per following week) and `percentages` (retained share, 0-1). The leading "Weighted Average" row summarises all cohorts. Useful for understanding long-term user engagement and product stickiness.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        return getRetentionCohortCore(projectId);
      }),
  );
}
