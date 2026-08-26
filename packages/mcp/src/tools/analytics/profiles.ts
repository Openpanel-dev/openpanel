import { findProfilesCore, getProfileSessionsCore, getProfileWithEvents } from '@openpanel/db';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import { profileUrl, dashboardBaseUrl } from '../dashboard-links';
import {
  projectIdSchema,
  resolveProjectId,
  table,
  withErrorHandling,
  zLimit,
} from '../shared';
import { EVENT_COLUMNS_DEFAULT, SESSION_COLUMNS_DEFAULT } from './columns';

const DEFAULT_PROFILE_LIMIT = 20;
const MAX_PROFILE_LIMIT = 100;
const DEFAULT_EVENT_LIMIT = 20;
const DEFAULT_SESSION_LIMIT = 20;

// findProfilesCore returns the raw ClickHouse row, which is snake_case —
// unlike getGroupMemberProfiles, which returns the camelCase service shape.
const PROFILE_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'created_at',
  'last_seen_at',
  'is_external',
] as const;

export function registerProfileTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'find_profiles',
    `Search and filter user profiles. Supports filtering by name, email, location, inactivity, session count, and whether they performed a specific event. Defaults to the ${DEFAULT_PROFILE_LIMIT} most recently created profiles. Build a dashboard link for any row by substituting its \`id\` into the returned \`profile_url_template\`.`,
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
      limit: zLimit(DEFAULT_PROFILE_LIMIT, MAX_PROFILE_LIMIT),
    },
    async ({ projectId: inputProjectId, ...input }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = input.limit ?? DEFAULT_PROFILE_LIMIT;
        const profiles = await findProfilesCore({
          ...input,
          projectId,
          limit: take + 1,
        });
        return {
          // One template instead of a ~90-character absolute URL on every row.
          profile_url_template: `${dashboardBaseUrl()}/${context.organizationId}/${projectId}/profiles/{id}`,
          ...table(profiles.slice(0, take), {
            limit: take,
            columns: PROFILE_COLUMNS,
            sortedBy: 'created_at',
            unit: 'profiles',
            moreAvailable: profiles.length > take,
          }),
        };
      }),
  );

  server.tool(
    'get_profile',
    'Get a specific user profile by ID along with their most recent events. Useful for understanding an individual user journey.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().describe('The profile ID to look up'),
      eventLimit: zLimit(DEFAULT_EVENT_LIMIT, 100),
    },
    async ({ projectId: inputProjectId, profileId, eventLimit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = eventLimit ?? DEFAULT_EVENT_LIMIT;
        const result = await getProfileWithEvents(projectId, profileId, take);
        if (!result.profile) {
          return { error: 'Profile not found', profileId };
        }
        return {
          profile: result.profile,
          dashboard_url: profileUrl(context.organizationId, projectId, profileId),
          recent_events: table(result.recent_events, {
            limit: take,
            columns: EVENT_COLUMNS_DEFAULT,
            sortedBy: 'created_at desc',
            unit: 'events',
          }),
        };
      }),
  );

  server.tool(
    'get_profile_sessions',
    'Get sessions for a specific user profile, ordered by most recent first. Each session includes duration, entry/exit pages, device info, and referrer.',
    {
      projectId: projectIdSchema(context),
      profileId: z.string().describe('The profile ID to fetch sessions for'),
      limit: zLimit(DEFAULT_SESSION_LIMIT, 100),
    },
    async ({ projectId: inputProjectId, profileId, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = limit ?? DEFAULT_SESSION_LIMIT;
        const sessions = await getProfileSessionsCore(projectId, profileId, take + 1);
        return {
          profileId,
          dashboard_url: profileUrl(context.organizationId, projectId, profileId),
          session_url_template: `${dashboardBaseUrl()}/${context.organizationId}/${projectId}/sessions/{id}`,
          ...table(sessions.slice(0, take), {
            limit: take,
            columns: SESSION_COLUMNS_DEFAULT,
            sortedBy: 'created_at desc',
            unit: 'sessions',
            moreAvailable: sessions.length > take,
          }),
        };
      }),
  );
}
