import { FunnelService, ch, getSettingsForProject } from '@openpanel/db';
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

const funnelService = new FunnelService(ch);

export async function getFunnelCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  steps: string[];
  windowHours?: number;
  groupBy?: 'session_id' | 'profile_id';
}) {
  const { timezone } = await getSettingsForProject(input.projectId);
  const eventSeries = input.steps.map((name, index) => ({
    id: String(index + 1),
    type: 'event' as const,
    name,
    displayName: name,
    segment: 'user' as const,
    filters: [],
  }));

  const result = await funnelService.getFunnel({
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    series: eventSeries,
    breakdowns: [],
    chartType: 'funnel',
    interval: 'day',
    range: 'custom',
    previous: false,
    metric: 'sum',
    options: {
      type: 'funnel',
      funnelWindow: input.windowHours ?? 24,
      funnelGroup: input.groupBy ?? 'session_id',
    },
    timezone,
  });

  // Take the first (unbreakdown) series and map steps to a readable format
  const primarySeries = result[0];
  if (!primarySeries) {
    return {
      steps: [],
      totalUsers: 0,
      completedUsers: 0,
      overallConversionRate: 0,
    };
  }

  const steps = primarySeries.steps.map((step, index) => ({
    step: index + 1,
    eventName: step.event.displayName || step.event.name,
    users: step.count,
    conversionRateFromStart: Math.round(step.percent * 100) / 100,
    dropoffPercent:
      step.dropoffPercent != null
        ? Math.round(step.dropoffPercent * 100) / 100
        : null,
    isHighestDropoff: step.isHighestDropoff,
  }));

  const totalUsers = steps[0]?.users ?? 0;
  const completedUsers = steps[steps.length - 1]?.users ?? 0;

  return {
    steps,
    totalUsers,
    completedUsers,
    overallConversionRate:
      totalUsers > 0
        ? Math.round((completedUsers / totalUsers) * 10000) / 100
        : 0,
  };
}

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
        const projectId = resolveProjectId(context, inputProjectId);
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
