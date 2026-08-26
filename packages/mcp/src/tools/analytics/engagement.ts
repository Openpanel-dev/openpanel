import { getRetentionLastSeenSeries } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
} from '../shared';

/** Guard for the opt-in raw histogram: one row per distinct "days ago" value. */
const MAX_DISTRIBUTION_ROWS = 200;

export function registerEngagementTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_user_last_seen_distribution',
    'Get a summary of how recently users were last active: how many are still fresh (0-7 days), somewhat stale (8-30 days), or churned (30+ days). Great for churn analysis and understanding overall engagement health. Pass includeDistribution to also get the raw per-day histogram.',
    {
      projectId: projectIdSchema(context),
      includeDistribution: z
        .boolean()
        .default(false)
        .optional()
        .describe(
          'Include the raw per-day histogram (one row per distinct "days since last seen"). Off by default — the bucketed summary answers the question in a fraction of the size.',
        ),
    },
    async ({ projectId: inputProjectId, includeDistribution }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const raw = await getRetentionLastSeenSeries({ projectId });

        // Bucket into meaningful segments for easier reading
        let active_0_7 = 0;
        let active_8_14 = 0;
        let active_15_30 = 0;
        let active_31_60 = 0;
        let churned_60_plus = 0;

        for (const row of raw) {
          if (row.days <= 7) active_0_7 += row.users;
          else if (row.days <= 14) active_8_14 += row.users;
          else if (row.days <= 30) active_15_30 += row.users;
          else if (row.days <= 60) active_31_60 += row.users;
          else churned_60_plus += row.users;
        }

        const total = active_0_7 + active_8_14 + active_15_30 + active_31_60 + churned_60_plus;

        return {
          summary: {
            total_identified_users: total,
            active_last_7_days: active_0_7,
            active_8_to_14_days: active_8_14,
            active_15_to_30_days: active_15_30,
            inactive_31_to_60_days: active_31_60,
            churned_60_plus_days: churned_60_plus,
          },
          ...(includeDistribution
            ? {
                distribution: table(raw, {
                  limit: MAX_DISTRIBUTION_ROWS,
                  columns: ['days', 'users'],
                  sum: ['users'],
                  sortedBy: 'days',
                  unit: 'buckets',
                }),
              }
            : {}),
        };
      }),
  );
}
