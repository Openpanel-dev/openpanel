import {
  chQuery,
  createGroup,
  deleteGroup,
  getGroupById,
  getGroupList,
  getGroupListCount,
  getGroupMemberProfiles,
  getGroupPropertyKeys,
  getGroupsByIds,
  getGroupTypes,
  TABLE_NAMES,
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
      return { data, meta: { count, take: input.take } };
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input: { id, projectId } }) => {
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
    .mutation(async ({ input }) => {
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
    .mutation(async ({ input: { id, projectId, ...data } }) => {
      return updateGroup(id, projectId, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ input: { id, projectId } }) => {
      return deleteGroup(id, projectId);
    }),

  types: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      return getGroupTypes(projectId);
    }),

  metrics: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input: { id, projectId } }) => {
      return chQuery<{
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
    }),

  activity: protectedProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .query(async ({ input: { id, projectId } }) => {
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

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      return getGroupPropertyKeys(projectId);
    }),

  listByIds: protectedProcedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(async ({ input: { projectId, ids } }) => {
      return getGroupsByIds(projectId, ids);
    }),
});
