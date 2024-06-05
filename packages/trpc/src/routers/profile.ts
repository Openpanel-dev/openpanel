import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { escape } from 'sqlstring';
import { z } from 'zod';

import { chQuery, createSqlBuilder } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const profileRouter = createTRPCRouter({
  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from profiles where project_id = ${escape(projectId)};`
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push('id', 'first_name', 'last_name', 'email');

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq
      )(properties);
    }),

  values: protectedProcedure
    .input(
      z.object({
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { property, projectId } }) => {
      const { sb, getSql } = createSqlBuilder();
      sb.from = 'profiles';
      sb.where.project_id = `project_id = ${escape(projectId)}`;
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct mapValues(mapExtractKeyLike(properties, ${escape(
          property.replace(/^properties\./, '').replace('.*.', '.%.')
        )})) as values`;
      } else {
        sb.select.values = `${property} as values`;
      }

      const profiles = await chQuery<{ values: string[] }>(getSql());

      const values = pipe(
        (data: typeof profiles) => map(prop('values'), data),
        flatten,
        uniq,
        sort((a, b) => a.length - b.length)
      )(profiles);

      return {
        values,
      };
    }),
});
