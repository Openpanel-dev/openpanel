import { queryEventsCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  EVENT_COLUMNS_DEFAULT,
  EVENT_COLUMNS_EXTRA,
} from './columns';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_EVENT_LIMIT = 20;
const MAX_EVENT_LIMIT = 100;


export function registerEventTools(server: McpServer, context: McpAuthContext) {
  server.tool(
    'query_events',
    `Query raw analytics events with optional filters. Returns individual event records as a columnar table. Defaults to the last 30 days and the ${DEFAULT_EVENT_LIMIT} most relevant events, with a commonly-useful field set — pass \`fields\` to add columns like origin, city, or sdk_name.`,
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
      fields: z
        .array(z.enum(EVENT_COLUMNS_EXTRA))
        .optional()
        .describe(
          `Extra columns to include beyond the default set (${EVENT_COLUMNS_DEFAULT.join(', ')}). Only request what you need — every extra column costs rows of output.`,
        ),
      limit: zLimit(DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT),
    },
    async ({ projectId: inputProjectId, fields, ...input }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = input.limit ?? DEFAULT_EVENT_LIMIT;
        const events = await queryEventsCore({
          ...input,
          projectId,
          limit: take + 1,
        });
        return table(events.slice(0, take), {
          limit: take,
          columns: [...EVENT_COLUMNS_DEFAULT, ...(fields ?? [])],
          sortedBy: 'created_at desc',
          unit: 'events',
          moreAvailable: events.length > take,
        });
      }),
  );
}
