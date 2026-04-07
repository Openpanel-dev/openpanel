import { TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { IClickhouseSession } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { sessionUrl } from '../dashboard-links';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  withErrorHandling,
  zDateRange,
} from '../shared';

export interface QuerySessionsInput {
  projectId: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  os?: string;
  referrer?: string;
  referrerName?: string;
  referrerType?: string;
  profileId?: string;
  limit?: number;
}

export async function querySessionsCore(
  input: QuerySessionsInput,
): Promise<IClickhouseSession[]> {
  const builder = clix(ch)
    .select<IClickhouseSession>([])
    .from(TABLE_NAMES.sessions)
    .where('project_id', '=', input.projectId)
    .where('sign', '=', 1);

  if (input.profileId) {
    builder.where('profile_id', '=', input.profileId);
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

  const { startDate: start, endDate: end } = resolveDateRange(input.startDate, input.endDate);

  builder.where('created_at', 'BETWEEN', [
    clix.datetime(start),
    clix.datetime(end),
  ]);

  return builder.limit(input.limit ?? 20).execute();
}

export function registerSessionTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'query_sessions',
    'Query user sessions with optional filters. Each session represents a single visit with duration, entry/exit pages, bounce status, and attribution data. Defaults to the last 30 days.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      country: z
        .string()
        .optional()
        .describe('Filter by ISO 3166-1 alpha-2 country code'),
      city: z.string().optional().describe('Filter by city name'),
      device: z
        .string()
        .optional()
        .describe('Filter by device type (desktop, mobile, tablet)'),
      browser: z.string().optional().describe('Filter by browser name'),
      os: z.string().optional().describe('Filter by OS name'),
      referrer: z.string().optional().describe('Filter by referrer URL'),
      referrerName: z.string().optional().describe('Filter by referrer name'),
      referrerType: z
        .string()
        .optional()
        .describe('Filter by referrer type (search, social, email, direct)'),
      profileId: z
        .string()
        .optional()
        .describe('Filter sessions for a specific user profile ID'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Maximum number of sessions to return (1-100, default 20)'),
    },
    async ({ projectId: inputProjectId, ...input }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const sessions = await querySessionsCore({ projectId, ...input });
        return sessions.map((s) => ({
          ...s,
          dashboard_url: sessionUrl(context.organizationId, projectId, s.id),
        }));
      }),
  );
}
