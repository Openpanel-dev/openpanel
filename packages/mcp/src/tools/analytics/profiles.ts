import { TABLE_NAMES, ch, chQuery, clix } from '@openpanel/db';
import type {
  IClickhouseEvent,
  IClickhouseProfile,
  IClickhouseSession,
} from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

/** Safely escape a string value for use in a ClickHouse SQL literal. */
function esc(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

const PROFILE_COLUMNS =
  'id, first_name, last_name, email, avatar, properties, project_id, is_external, created_at, groups';

export interface FindProfilesInput {
  projectId: string;
  /** Partial match against first_name OR last_name */
  name?: string;
  email?: string;
  country?: string;
  city?: string;
  device?: string;
  browser?: string;
  /** Profiles with no activity (events) in the last N days */
  inactiveDays?: number;
  /** Profiles with at least N total sessions */
  minSessions?: number;
  /** Only profiles that have performed this event at least once */
  performedEvent?: string;
  sortBy?: 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export async function findProfilesCore(
  input: FindProfilesInput,
): Promise<IClickhouseProfile[]> {
  const pid = esc(input.projectId);
  const conditions: string[] = [`project_id = ${pid}`];

  if (input.email) {
    conditions.push(`email LIKE ${esc('%' + input.email + '%')}`);
  }
  if (input.name) {
    const escaped = esc('%' + input.name + '%');
    conditions.push(`(first_name LIKE ${escaped} OR last_name LIKE ${escaped})`);
  }
  if (input.country) {
    conditions.push(`properties['country'] = ${esc(input.country)}`);
  }
  if (input.city) {
    conditions.push(`properties['city'] = ${esc(input.city)}`);
  }
  if (input.device) {
    conditions.push(`properties['device'] = ${esc(input.device)}`);
  }
  if (input.browser) {
    conditions.push(`properties['browser'] = ${esc(input.browser)}`);
  }

  if (input.inactiveDays !== undefined) {
    const days = Math.floor(input.inactiveDays);
    conditions.push(`id NOT IN (
      SELECT DISTINCT profile_id FROM ${TABLE_NAMES.events}
      WHERE project_id = ${pid}
        AND profile_id != ''
        AND created_at >= now() - INTERVAL ${days} DAY
    )`);
  }

  if (input.minSessions !== undefined) {
    const min = Math.floor(input.minSessions);
    conditions.push(`id IN (
      SELECT profile_id FROM ${TABLE_NAMES.sessions}
      WHERE project_id = ${pid}
        AND sign = 1
        AND profile_id != ''
      GROUP BY profile_id
      HAVING count() >= ${min}
    )`);
  }

  if (input.performedEvent) {
    conditions.push(`id IN (
      SELECT DISTINCT profile_id FROM ${TABLE_NAMES.events}
      WHERE project_id = ${pid}
        AND name = ${esc(input.performedEvent)}
    )`);
  }

  const orderDir = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(input.limit ?? 20, 100);

  const sql = `
    SELECT ${PROFILE_COLUMNS}
    FROM ${TABLE_NAMES.profiles}
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at ${orderDir}
    LIMIT ${limit}
  `;

  return chQuery<IClickhouseProfile>(sql);
}

export async function getProfileWithEvents(
  projectId: string,
  profileId: string,
  eventLimit = 10,
): Promise<{
  profile: IClickhouseProfile | null;
  recent_events: IClickhouseEvent[];
}> {
  const [profiles, recent_events] = await Promise.all([
    chQuery<IClickhouseProfile>(`
      SELECT ${PROFILE_COLUMNS}
      FROM ${TABLE_NAMES.profiles}
      WHERE project_id = ${esc(projectId)} AND id = ${esc(profileId)}
      LIMIT 1
    `),
    clix(ch)
      .select<IClickhouseEvent>([])
      .from(TABLE_NAMES.events)
      .where('project_id', '=', projectId)
      .where('profile_id', '=', profileId)
      .orderBy('created_at', 'DESC')
      .limit(eventLimit)
      .execute(),
  ]);

  return { profile: profiles[0] ?? null, recent_events };
}

export async function getProfileSessionsCore(
  projectId: string,
  profileId: string,
  limit = 20,
): Promise<IClickhouseSession[]> {
  return clix(ch)
    .select<IClickhouseSession>([])
    .from(TABLE_NAMES.sessions)
    .where('project_id', '=', projectId)
    .where('profile_id', '=', profileId)
    .where('sign', '=', 1)
    .orderBy('created_at', 'DESC')
    .limit(limit)
    .execute();
}

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
        const projectId = resolveProjectId(context, inputProjectId);
        return findProfilesCore({ projectId, ...input });
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
        const projectId = resolveProjectId(context, inputProjectId);
        const result = await getProfileWithEvents(projectId, profileId, eventLimit);
        if (!result.profile) {
          return { error: 'Profile not found', profileId };
        }
        return result;
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
        const projectId = resolveProjectId(context, inputProjectId);
        const sessions = await getProfileSessionsCore(projectId, profileId, limit);
        return { profileId, session_count: sessions.length, sessions };
      }),
  );
}
