import { SankeyService, ch, getSettingsForProject } from '@openpanel/db';
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

const sankeyService = new SankeyService(ch);

function toChartEvent(name: string) {
  return {
    id: name,
    name,
    displayName: name,
    type: 'event' as const,
    segment: 'event' as const,
    filters: [],
  };
}

export async function getUserFlowCore(input: {
  projectId: string;
  startDate: string;
  endDate: string;
  startEvent: string;
  endEvent?: string;
  mode: 'after' | 'before' | 'between';
  steps?: number;
  exclude?: string[];
  include?: string[];
}) {
  if (input.mode === 'between' && !input.endEvent) {
    return { error: 'endEvent is required when mode is "between"' };
  }

  const { timezone } = await getSettingsForProject(input.projectId);
  const result = await sankeyService.getSankey({
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    steps: input.steps ?? 5,
    mode: input.mode,
    startEvent: toChartEvent(input.startEvent),
    endEvent: input.endEvent ? toChartEvent(input.endEvent) : undefined,
    exclude: input.exclude ?? [],
    include: input.include,
    timezone,
  });

  return {
    mode: input.mode,
    startEvent: input.startEvent,
    endEvent: input.endEvent,
    node_count: result.nodes.length,
    link_count: result.links.length,
    nodes: result.nodes,
    links: result.links,
  };
}

export function registerUserFlowTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_user_flow',
    'Visualize user navigation flows as a Sankey diagram. Shows what events/pages users visit in sequence. Use mode "after" to see what happens after an event, "before" to see what leads up to it, or "between" to map paths from one event to another.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      startEvent: z
        .string()
        .describe('The anchor event name. For "after"/"before" mode this is the pivot event; for "between" it is the start.'),
      endEvent: z
        .string()
        .optional()
        .describe('Required for "between" mode: the destination event name.'),
      mode: z
        .enum(['after', 'before', 'between'])
        .default('after')
        .describe(
          '"after" = what users do after startEvent; "before" = what leads up to startEvent; "between" = paths from startEvent to endEvent.',
        ),
      steps: z
        .number()
        .int()
        .min(2)
        .max(10)
        .default(5)
        .optional()
        .describe('Number of steps to show in the flow (2-10, default 5)'),
      exclude: z
        .array(z.string())
        .optional()
        .describe('Event names to exclude from the flow (e.g. noisy system events)'),
      include: z
        .array(z.string())
        .optional()
        .describe('If set, only show these event names in the flow'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, startEvent, endEvent, mode, steps, exclude, include }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const { timezone } = await getSettingsForProject(projectId);

        if (mode === 'between' && !endEvent) {
          return { error: 'endEvent is required when mode is "between"' };
        }

        const result = await sankeyService.getSankey({
          projectId,
          startDate,
          endDate,
          steps: steps ?? 5,
          mode,
          startEvent: toChartEvent(startEvent),
          endEvent: endEvent ? toChartEvent(endEvent) : undefined,
          exclude: exclude ?? [],
          include,
          timezone,
        });

        return {
          mode,
          startEvent,
          endEvent,
          node_count: result.nodes.length,
          link_count: result.links.length,
          nodes: result.nodes,
          links: result.links,
        };
      }),
  );
}
