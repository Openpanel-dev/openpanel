import { TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { IClickhouseEvent } from '@openpanel/db';
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

export interface QueryEventsInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
  eventNames?: string[];
  path?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  referrer?: string;
  referrerName?: string;
  referrerType?: string;
  profileId?: string;
  properties?: Record<string, string>;
  limit?: number;
}

export async function queryEventsCore(
  input: QueryEventsInput,
): Promise<IClickhouseEvent[]> {
  const builder = clix(ch)
    .select<IClickhouseEvent>([])
    .from(TABLE_NAMES.events)
    .where('project_id', '=', input.projectId);

  if (input.profileId) {
    builder.where('profile_id', '=', input.profileId);
  }

  if (input.eventNames?.length) {
    builder.where('name', 'IN', input.eventNames);
  }

  if (input.path) {
    builder.where('path', '=', input.path);
  }

  if (input.referrer) {
    builder.where('referrer', '=', input.referrer);
  }

  if (input.referrerName) {
    builder.where('referrer_name', '=', input.referrerName);
  }

  if (input.referrerType) {
    builder.where('referrer_type', '=', input.referrerType);
  }

  if (input.device) {
    builder.where('device', '=', input.device);
  }

  if (input.country) {
    builder.where('country', '=', input.country);
  }

  if (input.city) {
    builder.where('city', '=', input.city);
  }

  if (input.os) {
    builder.where('os', '=', input.os);
  }

  if (input.browser) {
    builder.where('browser', '=', input.browser);
  }

  if (input.properties) {
    for (const [key, value] of Object.entries(input.properties)) {
      builder.where(`properties['${key}']`, '=', value);
    }
  }

  const { startDate: start, endDate: end } = resolveDateRange(input.startDate, input.endDate);

  builder.where('created_at', 'BETWEEN', [
    clix.datetime(start),
    clix.datetime(end),
  ]);

  return builder.limit(input.limit ?? 20).execute();
}

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
        const projectId = resolveProjectId(context, inputProjectId);
        return queryEventsCore({ projectId, ...input });
      }),
  );
}
