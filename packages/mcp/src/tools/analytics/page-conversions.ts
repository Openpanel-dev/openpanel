import { getPageConversionsCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  withErrorHandling,
  zDateRange,
  resolveProjectId,
} from '../shared';

export function registerPageConversionTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'get_page_conversions',
    'Find which pages drive the most conversions. Given a conversion event (e.g. "sign_up", "purchase"), returns pages ranked by how many unique visitors went on to convert within a configurable time window after the page view. Includes total_visitors and conversion_rate per page. Useful for identifying high-value content and optimizing landing pages.',
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
      limit: z
        .number()
        .min(1)
        .max(500)
        .default(50)
        .optional()
        .describe(
          'Maximum pages to return, sorted by unique_converters descending (default: 50)',
        ),
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
        const pages = await getPageConversionsCore({
          projectId,
          startDate,
          endDate,
          conversionEvent,
          windowHours: windowHours ?? 24,
          limit: limit ?? 50,
        });
        return {
          conversion_event: conversionEvent,
          window_hours: windowHours ?? 24,
          total_pages: pages.length,
          pages,
        };
      }),
  );
}
