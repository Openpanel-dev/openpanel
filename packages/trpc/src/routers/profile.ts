import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { z } from 'zod';

import {
  TABLE_NAMES,
  chQuery,
  createSqlBuilder,
  getProfileById,
  getProfileList,
  getProfileListCount,
  getProfileMetrics,
  getProfiles,
} from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const profileRouter = createTRPCRouter({
  byId: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return getProfileById(profileId, projectId);
    }),

  metrics: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return getProfileMetrics(profileId, projectId);
    }),

  activity: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; date: string }>(
        `SELECT count(*) as count, toStartOfDay(created_at) as date FROM ${TABLE_NAMES.events} WHERE project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY date ORDER BY date DESC`,
      );
    }),

  mostEvents: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; name: string }>(
        `SELECT count(*) as count, name FROM ${TABLE_NAMES.events} WHERE name NOT IN ('screen_view', 'session_start', 'session_end') AND project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY name ORDER BY count DESC`,
      );
    }),

  popularRoutes: protectedProcedure
    .input(z.object({ profileId: z.string(), projectId: z.string() }))
    .query(async ({ input: { profileId, projectId } }) => {
      return chQuery<{ count: number; path: string }>(
        `SELECT count(*) as count, path FROM ${TABLE_NAMES.events} WHERE name = 'screen_view' AND project_id = ${sqlstring.escape(projectId)} and profile_id = ${sqlstring.escape(profileId)} GROUP BY path ORDER BY count DESC LIMIT 10`,
      );
    }),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from ${TABLE_NAMES.profiles} where project_id = ${sqlstring.escape(projectId)};`,
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push('id', 'first_name', 'last_name', 'email');

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq,
      )(properties);
    }),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        isExternal: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      const [data, count] = await Promise.all([
        getProfileList(input),
        getProfileListCount(input),
      ]);
      return {
        data,
        meta: {
          count,
          pageCount: input.take,
        },
      };
    }),

  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
      }),
    )
    .query(async ({ input: { projectId, cursor, take } }) => {
      const res = await chQuery<{ profile_id: string; count: number }>(
        `
        SELECT profile_id, count(*) as count 
        FROM ${TABLE_NAMES.events} 
        WHERE 
          profile_id != '' 
          AND project_id = ${sqlstring.escape(projectId)} 
          GROUP BY profile_id 
          ORDER BY count() DESC 
          LIMIT ${take} ${cursor ? `OFFSET ${cursor * take}` : ''}`,
      );
      const profiles = await getProfiles(
        res.map((r) => r.profile_id),
        projectId,
      );

      const data = res
        .map((item) => {
          return {
            count: item.count,
            ...(profiles.find((p) => p.id === item.profile_id)! ?? {}),
          };
        })
        // Make sure we return actual profiles
        .filter((item) => item.id);

      return {
        data,
        meta: {
          count: data.length,
          pageCount: take,
        },
      };
    }),

  values: protectedProcedure
    .input(
      z.object({
        property: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input: { property, projectId } }) => {
      const { sb, getSql } = createSqlBuilder();
      sb.from = TABLE_NAMES.profiles;
      sb.where.project_id = `project_id = ${sqlstring.escape(projectId)}`;
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${sqlstring.escape(
          property.replace(/^properties\./, '').replace('.*.', '.%.'),
        )}))) as values`;
      } else {
        sb.select.values = `${property} as values`;
      }

      const profiles = await chQuery<{ values: string[] }>(getSql());

      const values = pipe(
        (data: typeof profiles) => map(prop('values'), data),
        flatten,
        uniq,
        sort((a, b) => a.length - b.length),
      )(profiles);

      return {
        values,
      };
    }),
});
