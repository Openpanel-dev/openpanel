import { TRPCError } from '@trpc/server';
import { escape } from 'sqlstring';
import { z } from 'zod';

import {
  chQuery,
  convertClickhouseDateToJs,
  db,
  getEventList,
  getEvents,
  getTopPages,
  TABLE_NAMES,
} from '@openpanel/db';
import { zChartEventFilter } from '@openpanel/validation';

import { getProjectAccessCached } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const eventRouter = createTRPCRouter({
  updateEventMeta: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string(),
        icon: z.string().optional(),
        color: z.string().optional(),
        conversion: z.boolean().optional(),
      })
    )
    .mutation(
      async ({ input: { projectId, name, icon, color, conversion } }) => {
        return db.eventMeta.upsert({
          where: {
            name_projectId: {
              name,
              projectId,
            },
          },
          create: { projectId, name, icon, color, conversion },
          update: { icon, color, conversion },
        });
      }
    ),

  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input: { id, projectId } }) => {
      const res = await getEvents(
        `SELECT * FROM ${TABLE_NAMES.events} WHERE id = ${escape(id)} AND project_id = ${escape(projectId)};`,
        {
          meta: true,
        }
      );

      if (!res?.[0]) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Event not found',
        });
      }

      return res[0];
    }),

  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        profileId: z.string().optional(),
        take: z.number().default(50),
        events: z.array(z.string()).optional(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        meta: z.boolean().optional(),
        profile: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      return getEventList(input);
    }),
  conversions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input: { projectId } }) => {
      const conversions = await db.eventMeta.findMany({
        where: {
          projectId,
          conversion: true,
        },
      });

      if (conversions.length === 0) {
        return [];
      }

      return getEvents(
        `SELECT * FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(projectId)} AND name IN (${conversions.map((c) => escape(c.name)).join(', ')}) ORDER BY created_at DESC LIMIT 20;`,
        {
          profile: true,
          meta: true,
        }
      );
    }),

  bots: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(8),
      })
    )
    .query(async ({ input: { projectId, cursor, limit }, ctx }) => {
      if (ctx.session.userId) {
        const access = await getProjectAccessCached({
          projectId,
          userId: ctx.session.userId,
        });
        if (!access) {
          throw TRPCAccessError('You do not have access to this project');
        }
      } else {
        const share = await db.shareOverview.findFirst({
          where: {
            projectId,
          },
        });

        if (!share) {
          throw TRPCAccessError('You do not have access to this project');
        }
      }

      const [events, counts] = await Promise.all([
        chQuery<{
          id: string;
          project_id: string;
          name: string;
          type: string;
          path: string;
          created_at: string;
        }>(
          `SELECT * FROM events_bots WHERE project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(cursor ?? 0) * limit}`
        ),
        chQuery<{
          count: number;
        }>(
          `SELECT count(*) as count FROM events_bots WHERE project_id = ${escape(projectId)}`
        ),
      ]);

      return {
        data: events.map((item) => ({
          ...item,
          createdAt: convertClickhouseDateToJs(item.created_at),
        })),
        count: counts[0]?.count ?? 0,
      };
    }),

  pages: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return getTopPages(input);
    }),
});
