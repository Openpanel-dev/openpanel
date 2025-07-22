import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { escape } from 'sqlstring';
import { z } from 'zod';

import {
  TABLE_NAMES,
  chQuery,
  createSqlBuilder,
  getProfileList,
  getProfiles,
} from '@openpanel/db';
import { zChartEventFilter } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const profileRouter = createTRPCRouter({
  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from ${TABLE_NAMES.profiles} where project_id = ${escape(projectId)};`,
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
        events: z.array(z.string()).optional(),
        filters: z.array(zChartEventFilter).optional(),
      }),
    )
    .query(async ({ input: { projectId, cursor, take, search, events, filters } }) => {
      return getProfileList({ projectId, cursor, take, search, events, filters });
    }),

  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        // filters: z.array(zChartEventFilter).default([]),
      }),
    )
    .query(async ({ input: { projectId, cursor, take } }) => {
      const res = await chQuery<{ profile_id: string; count: number }>(
        `SELECT profile_id, count(*) as count from ${TABLE_NAMES.events} where profile_id != '' and project_id = ${escape(projectId)} group by profile_id order by count() DESC LIMIT ${take} ${cursor ? `OFFSET ${cursor * take}` : ''}`,
      );
      const profiles = await getProfiles(
        res.map((r) => r.profile_id),
        projectId,
      );
      return (
        res
          .map((item) => {
            return {
              count: item.count,
              ...(profiles.find((p) => p.id === item.profile_id)! ?? {}),
            };
          })
          // Make sure we return actual profiles
          .filter((item) => item.id)
      );
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
      sb.where.project_id = `project_id = ${escape(projectId)}`;
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${escape(
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
