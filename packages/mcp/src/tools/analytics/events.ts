import { resolveClientProjectId, queryEventsCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
} from '../shared';

export function registerEventTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'query_events',
    'Query raw analytics events with optional filters. Returns individual event records including path, device, country, referrer, and custom properties. Defaults to the last 30 days.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      eventNames: z
        .array(z.string())
        .optional()
        .describe(
          'Filter by event names (e.g. ["screen_view", "session_start"])',
        ),
      path: z.string().optional().describe('Filter by exact page path'),
      country: z
        .string()
        .optional()
        .describe('Filter by ISO 3166-1 alpha-2 country code (e.g. US, GB)'),
      city: z.string().optional().describe('Filter by city name'),
      device: z
        .string()
        .optional()
        .describe('Filter by device type (e.g. desktop, mobile, tablet)'),
      browser: z
        .string()
        .optional()
        .describe('Filter by browser name (e.g. Chrome, Firefox)'),
      os: z.string().optional().describe('Filter by OS name (e.g. Windows, macOS)'),
      referrer: z.string().optional().describe('Filter by referrer URL'),
      referrerName: z
        .string()
        .optional()
        .describe('Filter by referrer name (e.g. Google, Twitter)'),
      referrerType: z
        .string()
        .optional()
        .describe('Filter by referrer type (e.g. search, social, email)'),
      profileId: z
        .string()
        .optional()
        .describe('Filter events for a specific user profile ID'),
      properties: z
        .record(z.string(), z.string())
        .optional()
        .describe('Filter by custom event properties (key-value pairs)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Maximum number of events to return (1-100, default 20)'),
    },
    async ({ projectId: inputProjectId, ...input }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        return queryEventsCore({ projectId, ...input });
      }),
  );
}
