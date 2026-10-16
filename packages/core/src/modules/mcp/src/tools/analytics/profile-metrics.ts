import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getProfileMetrics,
  summarizeProfileMetrics,
} from '../../../../profile/profile.service';
import {
  type McpToolDeps,
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export function registerProfileMetricTools(
  server: McpServer,
  { context, deps }: McpToolDeps
) {
  server.tool(
    'get_profile_metrics',
    'Get computed lifetime metrics for a specific user: sessions, screen views, total events, avg session duration (p50/p90), bounce rate, unique active days, conversion events, avg time between sessions, and total revenue. Useful for understanding individual user health at a glance.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().describe('The profile ID to get metrics for'),
    },
    async ({ projectId: inputProjectId, profileId }) =>
      withErrorHandling(deps, async () => {
        const projectId = await resolveProjectId(deps, context, inputProjectId);
        const raw = await getProfileMetrics(deps, profileId, projectId);
        if (!raw) {
          return { error: 'Profile not found or has no events', profileId };
        }
        return summarizeProfileMetrics(profileId, raw);
      })
  );
}
