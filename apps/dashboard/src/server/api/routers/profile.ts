import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '@/server/api/trpc';
import { db } from '@/server/db';
import { flatten, map, pipe, prop, sort, uniq } from 'ramda';
import { z } from 'zod';

import { chQuery, createSqlBuilder } from '@openpanel/db';

export const profileRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        query: z.string().nullable(),
        projectId: z.string(),
        take: z.number().default(100),
        skip: z.number().default(0),
      })
    )
    .query(async ({ input: { take, skip, projectId, query } }) => {
      return db.profile.findMany({
        take,
        skip,
        where: {
          project_id: projectId,
          ...(query
            ? {
                OR: [
                  {
                    first_name: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    last_name: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                  {
                    email: {
                      contains: query,
                      mode: 'insensitive',
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),
  get: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input: { id } }) => {
      return db.profile.findUniqueOrThrow({
        where: {
          id,
        },
      });
    }),
  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId } }) => {
      const events = await chQuery<{ keys: string[] }>(
        `SELECT distinct mapKeys(properties) as keys from profiles where project_id = '${projectId}';`
      );

      const properties = events
        .flatMap((event) => event.keys)
        .map((item) => item.replace(/\.([0-9]+)\./g, '.*.'))
        .map((item) => item.replace(/\.([0-9]+)/g, '[*]'))
        .map((item) => `properties.${item}`);

      properties.push('external_id', 'first_name', 'last_name', 'email');

      return pipe(
        sort<string>((a, b) => a.length - b.length),
        uniq
      )(properties);
    }),
  values: publicProcedure
    .input(
      z.object({
        property: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { property, projectId } }) => {
      const { sb, getSql } = createSqlBuilder();
      sb.from = 'profiles';
      sb.where.project_id = `project_id = '${projectId}'`;
      if (property.startsWith('properties.')) {
        sb.select.values = `distinct mapValues(mapExtractKeyLike(properties, '${property
          .replace(/^properties\./, '')
          .replace('.*.', '.%.')}')) as values`;
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
