import { querySessionsCore } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { dashboardBaseUrl } from '../dashboard-links';
import {
  SESSION_COLUMNS_DEFAULT,
  SESSION_COLUMNS_EXTRA,
} from './columns';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_SESSION_LIMIT = 20;
const MAX_SESSION_LIMIT = 100;


export function registerSessionTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'query_sessions',
    `Query user sessions with optional filters. Each session represents a single visit with duration, entry/exit pages, bounce status, and attribution data. Defaults to the last 30 days and ${DEFAULT_SESSION_LIMIT} sessions. Build a dashboard link for any row by substituting its \`id\` into the returned \`session_url_template\`.`,
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
      fields: z
        .array(z.enum(SESSION_COLUMNS_EXTRA))
        .optional()
        .describe(
          'Extra columns to include beyond the default set. Only request what you need — every extra column costs rows of output.',
        ),
      limit: zLimit(DEFAULT_SESSION_LIMIT, MAX_SESSION_LIMIT),
    },
    async ({ projectId: inputProjectId, fields, ...input }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = input.limit ?? DEFAULT_SESSION_LIMIT;
        const sessions = await querySessionsCore({
          ...input,
          projectId,
          limit: take + 1,
        });
        return {
          // One template beats stamping a ~90-character absolute URL onto every
          // row — the model can substitute `id` itself.
          session_url_template: `${dashboardBaseUrl()}/${context.organizationId}/${projectId}/sessions/{id}`,
          ...table(sessions.slice(0, take), {
            limit: take,
            columns: [...SESSION_COLUMNS_DEFAULT, ...(fields ?? [])],
            sortedBy: 'created_at desc',
            unit: 'sessions',
            moreAvailable: sessions.length > take,
          }),
        };
      }),
  );
}
