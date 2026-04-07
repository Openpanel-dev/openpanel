import { resolveClientProjectId, findProfilesCore, getProfileSessionsCore, getProfileWithEvents } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { profileUrl, sessionUrl } from '../dashboard-links';
import {
  projectIdSchema,
  
  withErrorHandling,
} from '../shared';

export function registerProfileTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'find_profiles',
    'Search and filter user profiles. Supports filtering by name, email, location, inactivity, session count, and whether they performed a specific event. Defaults to the 20 most recently created profiles.',
    {
      projectId: projectIdSchema(context),
      name: z
        .string()
        .optional()
        .describe('Partial match against first name or last name (e.g. "Carl")'),
      email: z
        .string()
        .optional()
        .describe('Partial email match'),
      country: z
        .string()
        .optional()
        .describe('Filter by ISO 3166-1 alpha-2 country code (e.g. US, SE)'),
      city: z.string().optional().describe('Filter by city name'),
      device: z
        .string()
        .optional()
        .describe('Filter by device type (desktop, mobile, tablet)'),
      browser: z.string().optional().describe('Filter by browser name'),
      inactiveDays: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Return only profiles with no activity (events) in the last N days. E.g. 14 = inactive for 2+ weeks.',
        ),
      minSessions: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Return only profiles with at least N total sessions'),
      performedEvent: z
        .string()
        .optional()
        .describe(
          'Return only profiles that have performed this event at least once (e.g. "purchase", "sign_up")',
        ),
      sortOrder: z
        .enum(['asc', 'desc'])
        .default('desc')
        .optional()
        .describe('Sort direction for created_at (default: desc = newest first)'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Maximum number of profiles to return (1-100, default 20)'),
    },
    async ({ projectId: inputProjectId, ...input }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const profiles = await findProfilesCore({ projectId, ...input });
        return profiles.map((p) => ({
          ...p,
          dashboard_url: profileUrl(context.organizationId, projectId, p.id),
        }));
      }),
  );

  server.tool(
    'get_profile',
    'Get a specific user profile by ID along with their most recent events. Useful for understanding an individual user journey.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().describe('The profile ID to look up'),
      eventLimit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Number of recent events to include (1-100, default 20)'),
    },
    async ({ projectId: inputProjectId, profileId, eventLimit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const result = await getProfileWithEvents(projectId, profileId, eventLimit);
        if (!result.profile) {
          return { error: 'Profile not found', profileId };
        }
        return {
          ...result,
          dashboard_url: profileUrl(context.organizationId, projectId, profileId),
        };
      }),
  );

  server.tool(
    'get_profile_sessions',
    'Get all sessions for a specific user profile, ordered by most recent first. Each session includes duration, entry/exit pages, device info, and referrer.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().describe('The profile ID to fetch sessions for'),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(20)
        .optional()
        .describe('Maximum number of sessions to return (1-100, default 20)'),
    },
    async ({ projectId: inputProjectId, profileId, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveClientProjectId({ clientType: context.clientType, clientProjectId: context.projectId, organizationId: context.organizationId, inputProjectId });
        const sessions = await getProfileSessionsCore(projectId, profileId, limit);
        return {
          profileId,
          dashboard_url: profileUrl(context.organizationId, projectId, profileId),
          session_count: sessions.length,
          sessions: sessions.map((s) => ({
            ...s,
            dashboard_url: sessionUrl(context.organizationId, projectId, s.id),
          })),
        };
      }),
  );
}
