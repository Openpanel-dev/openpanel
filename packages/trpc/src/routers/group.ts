import {
  chQuery,
  db,
  deleteGroup,
  getGroupById,
  getGroupList,
  getGroupListCount,
  getGroupTypes,
  TABLE_NAMES,
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
    .query(async ({ input: { id, projectId } }) => {
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
        ORDER BY lastSeen DESC
        LIMIT 100
      `);
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      // Returns distinct property keys across all groups for this project
      // Used by breakdown/filter pickers in the chart builder
      const groups = await db.group.findMany({
        where: { projectId },
        select: { properties: true },
      });
      const keys = new Set<string>();
      for (const group of groups) {
        const props = group.properties as Record<string, unknown>;
        for (const key of Object.keys(props)) {
          keys.add(key);
        }
      }
      return Array.from(keys).sort();
    }),
});
