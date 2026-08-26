import { getUserFlowCore } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_FLOW_NODES = 60;
const MAX_FLOW_NODES = 500;

export function registerUserFlowTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_user_flow',
    'Map user navigation flows as a graph of nodes and links (a Sankey diagram). Shows what events/pages users visit in sequence. Use mode "after" to see what happens after an event, "before" to see what leads up to it, or "between" to map paths from one event to another. Wide flows are trimmed to the highest-volume nodes — use `exclude`/`include` or fewer `steps` to focus the graph rather than raising the limit.',
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
      limit: zLimit(DEFAULT_FLOW_NODES, MAX_FLOW_NODES),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, startEvent, endEvent, mode, steps, exclude, include, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const take = limit ?? DEFAULT_FLOW_NODES;
        const flow = await getUserFlowCore({ projectId, startDate, endDate, startEvent, endEvent, mode, steps, exclude, include });

        // Trim to the highest-volume nodes, then drop links that would dangle —
        // a link pointing at a node we cut is worse than no link at all.
        const nodes = [...flow.nodes]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .slice(0, take);
        const kept = new Set(nodes.map((node) => node.id));
        const links = flow.links.filter(
          (link) => kept.has(link.source) && kept.has(link.target),
        );

        return {
          mode: flow.mode,
          startEvent: flow.startEvent,
          endEvent: flow.endEvent,
          node_count: flow.node_count,
          link_count: flow.link_count,
          ...(flow.nodes.length > nodes.length
            ? {
                flow_note: `Trimmed to the ${nodes.length} highest-volume of ${flow.nodes.length} nodes; ${flow.links.length - links.length} links referencing dropped nodes were removed. Use \`include\`/\`exclude\` or fewer \`steps\` to focus the flow.`,
              }
            : {}),
          // nodeColor is a UI concern and carries no meaning for a reader.
          nodes: table(nodes, {
            limit: take,
            columns: ['id', 'label', 'step', 'value', 'percentage'],
            sortedBy: 'value',
            unit: 'nodes',
          }),
          links: table(links, {
            limit: MAX_FLOW_NODES * 4,
            columns: ['source', 'target', 'value'],
            sortedBy: 'value',
            unit: 'links',
          }),
        };
      }),
  );
}
