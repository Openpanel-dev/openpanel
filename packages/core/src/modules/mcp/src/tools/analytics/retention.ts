import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getRetentionCohortCore } from '../../../../chart/retention.service';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export function registerRetentionTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'get_retention_cohort',
    'Get a weekly active-user retention cohort for the last 12 weeks. Returns one row per cohort (the week users were first seen), each with `cohort_interval`, `sum` (cohort size), `values` (retained user counts per following week) and `percentages` (retained share, 0-1). The leading "Weighted Average" row summarises all cohorts. Useful for understanding long-term user engagement and product stickiness.',
    {
      projectId: projectIdSchema(context),
    },
    async ({ projectId: inputProjectId }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        return getRetentionCohortCore(deps, projectId);
      })
  );
}
