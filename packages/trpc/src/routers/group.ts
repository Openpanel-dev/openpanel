import {
  chQuery,
  createGroup,
  deleteGroup,
  getGroupById,
  getGroupList,
  getGroupListCount,
  getGroupMemberProfiles,
  getGroupPropertyKeys,
  getGroupStats,
  getGroupsByIds,
  getGroupTypes,
  getProfiles,
  TABLE_NAMES,
  toNullIfDefaultMinDate,
  updateGroup,
} from '@openpanel/db';
import { zCreateGroup, zUpdateGroup } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const groupRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        type: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const [data, count] = await Promise.all([
        getGroupList(input),
        getGroupListCount(input),
      ]);
      const stats = await getGroupStats(
        input.projectId,
        data.map((g) => g.id)
      );
      return {
        data: data.map((g) => ({
          ...g,
          memberCount: stats.get(g.id)?.memberCount ?? 0,
          lastActiveAt: stats.get(g.id)?.lastActiveAt ?? null,
        })),
        meta: { count, take: input.take },
      };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return getGroupById(id, projectId);
    }),

  create: protectedProcedure
    .input(zCreateGroup)
    .mutation(({ input }) => {
      return createGroup(input);
    }),

  update: protectedProcedure
    .input(zUpdateGroup)
    .mutation(({ input: { id, projectId, ...data } }) => {
      return updateGroup(id, projectId, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(({ input: { id, projectId } }) => {
      return deleteGroup(id, projectId);
    }),

  types: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => {
      return getGroupTypes(projectId);
    }),

  metrics: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input: { id, projectId } }) => {
      const [eventData, profileData, sessionData] = await Promise.all([
        chQuery<{ totalEvents: number; firstSeen: string; lastSeen: string }>(`
          SELECT
            count() AS totalEvents,
            min(created_at) AS firstSeen,
            max(created_at) AS lastSeen
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND has(groups, ${sqlstring.escape(id)})
        `),
        chQuery<{ uniqueProfiles: number }>(`
          SELECT count() AS uniqueProfiles
          FROM ${TABLE_NAMES.profiles} FINAL
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND has(groups, ${sqlstring.escape(id)})
        `),
        // Session aggregates come from the sessions table FINAL, joined
        // on profile_id so we cover every session every member of the
        // group has ever had — even if that specific session wasn't
        // tagged with the group.
        chQuery<{ totalSessions: number; totalSessionDuration: number }>(`
          SELECT
            count() AS totalSessions,
            -- minutes
            round(sum(duration) / 60, 2) AS totalSessionDuration
          FROM ${TABLE_NAMES.sessions} FINAL
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND profile_id IN (
              SELECT id FROM ${TABLE_NAMES.profiles} FINAL
              WHERE project_id = ${sqlstring.escape(projectId)}
                AND has(groups, ${sqlstring.escape(id)})
            )
        `),
      ]);

      return {
        totalEvents: eventData[0]?.totalEvents ?? 0,
        uniqueProfiles: profileData[0]?.uniqueProfiles ?? 0,
        totalSessions: sessionData[0]?.totalSessions ?? 0,
        totalSessionDuration: sessionData[0]?.totalSessionDuration ?? 0,
        firstSeen: toNullIfDefaultMinDate(eventData[0]?.firstSeen),
        lastSeen: toNullIfDefaultMinDate(eventData[0]?.lastSeen),
      };
    }),

  activity: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{ count: number; date: string }>(`
        SELECT count() AS count, toStartOfDay(created_at) AS date
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
        GROUP BY date
        ORDER BY date DESC
      `);
    }),

  memberGrowth: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{ date: string; count: number }>(`
        SELECT
          toDate(toStartOfDay(created_at)) AS date,
          count() AS count
        FROM ${TABLE_NAMES.profiles} FINAL
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
          AND created_at >= now() - INTERVAL 30 DAY
        GROUP BY date
        ORDER BY date ASC WITH FILL
          FROM toDate(now() - INTERVAL 29 DAY)
          TO toDate(now() + INTERVAL 1 DAY)
          STEP 1
      `);
    }),

  /**
   * Platform breakdown for a group — web vs iOS vs Android, aggregated
   * across every member's events. Mirrors `profile.platforms` so we
   * can reuse the same card on the group page.
   */
  platforms: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input: { id, projectId } }) => {
      const rows = await chQuery<{
        sdk_name: string;
        os: string;
        browsers: string[];
        sessions: number;
        events: number;
        last_seen: string;
        app_version: string;
        build_number: string;
      }>(
        `SELECT
          sdk_name,
          any(os) as os,
          arrayFilter(
            x -> length(x) > 0,
            arrayMap(
              x -> trim(concat(tupleElement(x, 1), ' ', tupleElement(x, 2))),
              groupUniqArray(tuple(browser, browser_version))
            )
          ) as browsers,
          count(distinct session_id) as sessions,
          count() as events,
          max(created_at) as last_seen,
          argMax(properties['__version'], created_at) as app_version,
          argMax(properties['__buildNumber'], created_at) as build_number
         FROM ${TABLE_NAMES.events}
         WHERE project_id = ${sqlstring.escape(projectId)}
           AND has(groups, ${sqlstring.escape(id)})
         GROUP BY sdk_name
         ORDER BY sessions DESC`,
      );

      function friendlyLabel(sdkName: string, os: string) {
        const s = (sdkName || '').toLowerCase();
        if (!s) {
          if (os.toLowerCase().includes('ios')) return 'iOS';
          if (os.toLowerCase().includes('android')) return 'Android';
          return 'Unknown';
        }
        if (s.includes('web') || s === 'js' || s.includes('browser')) {
          return 'Web';
        }
        if (s.includes('ios') || s.includes('swift')) return 'iOS';
        if (s.includes('android') || s.includes('kotlin')) return 'Android';
        if (s.includes('react-native') || s.includes('reactnative')) {
          return 'React Native';
        }
        if (s.includes('node')) return 'Server';
        return sdkName;
      }

      return rows.map((r) => ({
        sdkName: r.sdk_name || null,
        label: friendlyLabel(r.sdk_name, r.os),
        sessions: Number(r.sessions) || 0,
        events: Number(r.events) || 0,
        lastSeen: r.last_seen,
        appVersion: r.app_version || null,
        buildNumber: r.build_number || null,
        browsers: Array.isArray(r.browsers) ? r.browsers : [],
      }));
    }),

  /**
   * Top N members of the group, ranked by event count. Powers the
   * "Power users in this team" card on the group detail page.
   */
  topMembers: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        take: z.number().default(5),
      }),
    )
    .query(async ({ input: { id, projectId, take } }) => {
      // First pick the top profile_ids by event count for this group,
      // then hydrate them into full profile records.
      const rows = await chQuery<{
        profile_id: string;
        event_count: number;
        last_seen: string;
      }>(
        `SELECT
          profile_id,
          count() as event_count,
          max(created_at) as last_seen
         FROM ${TABLE_NAMES.events}
         WHERE project_id = ${sqlstring.escape(projectId)}
           AND has(groups, ${sqlstring.escape(id)})
           AND profile_id != ''
         GROUP BY profile_id
         ORDER BY event_count DESC
         LIMIT ${take}`,
      );

      if (rows.length === 0) return [];

      const profiles = await getProfiles(
        rows.map((r) => r.profile_id),
        projectId,
      );

      return rows
        .map((r) => {
          const profile = profiles.find((p) => p.id === r.profile_id);
          if (!profile) return null;
          return {
            profile,
            eventCount: Number(r.event_count) || 0,
            lastSeen: r.last_seen,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }),

  listProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        groupId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { data, count } = await getGroupMemberProfiles({
        projectId: input.projectId,
        groupId: input.groupId,
        cursor: input.cursor,
        take: input.take,
        search: input.search,
      });
      return {
        data,
        meta: { count, pageCount: input.take },
      };
    }),

  mostEvents: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{ count: number; name: string }>(`
        SELECT count() as count, name
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
          AND name NOT IN ('screen_view', 'session_start', 'session_end')
        GROUP BY name
        ORDER BY count DESC
        LIMIT 10
      `);
    }),

  popularRoutes: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{ count: number; path: string }>(`
        SELECT count() as count, path
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
          AND name = 'screen_view'
        GROUP BY path
        ORDER BY count DESC
        LIMIT 10
      `);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => {
      return getGroupPropertyKeys(projectId);
    }),

  listByIds: protectedProcedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(({ input: { projectId, ids } }) => {
      return getGroupsByIds(projectId, ids);
    }),
});
