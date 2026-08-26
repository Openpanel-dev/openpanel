import { getPageConversionsCore } from '@openpanel/db';
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

const DEFAULT_CONVERSION_LIMIT = 25;
const MAX_CONVERSION_LIMIT = 500;

export function registerPageConversionTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'get_page_conversions',
    `Find which pages drive the most conversions. Given a conversion event (e.g. "sign_up", "purchase"), returns pages ranked by how many unique visitors went on to convert within a configurable time window after the page view. Includes total_visitors and conversion_rate per page. Useful for identifying high-value content and optimizing landing pages. Defaults to the top ${DEFAULT_CONVERSION_LIMIT} pages.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      conversionEvent: z
        .string()
        .describe(
          'The event name that counts as a conversion (e.g. "sign_up", "purchase", "trial_started"). Use list_event_names to discover available events.',
        ),
      windowHours: z
        .number()
        .min(1)
        .max(720)
        .default(24)
        .optional()
        .describe(
          'How many hours after a page view a conversion still counts (default: 24). Use 1 for same-session, 168 for 7-day window.',
        ),
      limit: zLimit(DEFAULT_CONVERSION_LIMIT, MAX_CONVERSION_LIMIT),
    },
    async ({
      projectId: inputProjectId,
      startDate: sd,
      endDate: ed,
      conversionEvent,
      windowHours,
      limit,
    }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const take = limit ?? DEFAULT_CONVERSION_LIMIT;
        const pages = await getPageConversionsCore({
          projectId,
          startDate,
          endDate,
          conversionEvent,
          windowHours: windowHours ?? 24,
          limit: take + 1,
        });
        return {
          conversion_event: conversionEvent,
          window_hours: windowHours ?? 24,
          // SQL-limited, so there's no countable tail to roll up — the extra
          // fetched row just flags that more pages exist.
          ...table(pages.slice(0, take), {
            limit: take,
            columns: ['path', 'origin', 'unique_converters', 'total_visitors', 'conversion_rate'],
            sortedBy: 'unique_converters',
            unit: 'pages',
            moreAvailable: pages.length > take,
          }),
        };
      }),
  );
}
