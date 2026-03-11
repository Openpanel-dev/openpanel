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
  TABLE_NAMES,
  toNullIfDefaultMinDate,
  updateGroup,
} from '@openpanel/db';
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
    .input(
      z.object({
        id: z.string().min(1),
        projectId: z.string(),
        type: z.string().min(1),
        name: z.string().min(1),
        properties: z.record(z.string()).default({}),
      })
    )
    .mutation(({ input }) => {
      return createGroup(input);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        projectId: z.string(),
        type: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        properties: z.record(z.string()).optional(),
      })
    )
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
      const data = await chQuery<{
        totalEvents: number;
        uniqueProfiles: number;
        firstSeen: string;
        lastSeen: string;
      }>(`
        SELECT
          count() AS totalEvents,
          uniqExact(profile_id) AS uniqueProfiles,
          min(created_at) AS firstSeen,
          max(created_at) AS lastSeen
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
      `);

      return {
        totalEvents: data[0]?.totalEvents ?? 0,
        uniqueProfiles: data[0]?.uniqueProfiles ?? 0,
        firstSeen: toNullIfDefaultMinDate(data[0]?.firstSeen),
        lastSeen: toNullIfDefaultMinDate(data[0]?.lastSeen),
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

  members: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{
        profileId: string;
        lastSeen: string;
        eventCount: number;
      }>(`
        SELECT
          profile_id AS profileId,
          max(created_at) AS lastSeen,
          count() AS eventCount
        FROM ${TABLE_NAMES.events}
        WHERE project_id = ${sqlstring.escape(projectId)}
          AND has(groups, ${sqlstring.escape(id)})
          AND profile_id != device_id
        GROUP BY profile_id
        ORDER BY lastSeen DESC, eventCount DESC
        LIMIT 50
      `);
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

  memberGrowth: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(({ input: { id, projectId } }) => {
      return chQuery<{ date: string; count: number }>(`
        SELECT
          toDate(toStartOfDay(min_date)) AS date,
          count() AS count
        FROM (
          SELECT profile_id, min(created_at) AS min_date
          FROM ${TABLE_NAMES.events}
          WHERE project_id = ${sqlstring.escape(projectId)}
            AND has(groups, ${sqlstring.escape(id)})
            AND profile_id != device_id
            AND created_at >= now() - INTERVAL 30 DAY
          GROUP BY profile_id
        )
        GROUP BY date
        ORDER BY date ASC WITH FILL
          FROM toDate(now() - INTERVAL 29 DAY)
          TO toDate(now() + INTERVAL 1 DAY)
          STEP 1
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
