import { TRPCError } from '@trpc/server';
import { escape } from 'sqlstring';
import { z } from 'zod';

import {
  type IServiceProfile,
  TABLE_NAMES,
  chQuery,
  convertClickhouseDateToJs,
  db,
  eventService,
  formatClickhouseDate,
  getEventList,
  getEvents,
  getTopPages,
} from '@openpanel/db';
import { zChartEventFilter } from '@openpanel/validation';

import { addMinutes, subMinutes } from 'date-fns';
import { clone } from 'ramda';
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
      }),
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
      },
    ),

  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
        createdAt: z.date().optional(),
      }),
    )
    .query(async ({ input: { id, projectId, createdAt } }) => {
      const res = await eventService.getById({
        projectId,
        id,
        createdAt,
      });

      if (!res) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Event not found',
        });
      }

      return res;
    }),

  events: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        profileId: z.string().optional(),
        cursor: z.string().optional(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }),
    )
    .query(async ({ input }) => {
      const items = await getEventList({
        ...input,
        take: 50,
        cursor: input.cursor ? new Date(input.cursor) : undefined,
      });

      // Hacky join to get profile for entire session
      // TODO: Replace this with a join on the session table
      const map = new Map<string, IServiceProfile>(); // sessionId -> profileId
      for (const item of items) {
        if (item.sessionId && item.profile?.isExternal === true) {
          map.set(item.sessionId, item.profile);
        }
      }

      for (const item of items) {
        const profile = map.get(item.sessionId);
        if (profile && (item.profile?.isExternal === false || !item.profile)) {
          item.profile = clone(profile);
          if (item?.profile?.firstName) {
            item.profile.firstName = `* ${item.profile.firstName}`;
          }
        }
      }

      const lastItem = items[items.length - 1];

      return {
        items,
        meta: {
          next:
            items.length === 50 && lastItem
              ? lastItem.createdAt.toISOString()
              : null,
        },
      };
    }),
  conversions: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input: { projectId, cursor } }) => {
      const conversions = await db.eventMeta.findMany({
        where: {
          projectId,
          conversion: true,
        },
      });

      if (conversions.length === 0) {
        return {
          items: [],
          meta: {
            next: null,
          },
        };
      }

      const items = await getEvents(
        `SELECT * FROM ${TABLE_NAMES.events} WHERE ${cursor ? `created_at <= '${formatClickhouseDate(cursor)}' AND` : ''} project_id = ${escape(projectId)} AND name IN (${conversions.map((c) => escape(c.name)).join(', ')}) ORDER BY toDate(created_at) DESC, created_at DESC LIMIT 50;`,
        {
          profile: true,
          meta: true,
        },
      );

      const lastItem = items[items.length - 1];

      return {
        items,
        meta: {
          next: lastItem ? lastItem.createdAt.toISOString() : null,
        },
      };
    }),

  bots: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        limit: z.number().default(8),
      }),
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
          `SELECT * FROM ${TABLE_NAMES.events_bots} WHERE project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(cursor ?? 0) * limit}`,
        ),
        chQuery<{
          count: number;
        }>(
          `SELECT count(*) as count FROM ${TABLE_NAMES.events_bots} WHERE project_id = ${escape(projectId)}`,
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
      }),
    )
    .query(async ({ input }) => {
      return getTopPages(input);
    }),

  origin: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const res = await chQuery<{ origin: string }>(
        `SELECT DISTINCT origin FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(
          input.projectId,
        )} AND origin IS NOT NULL AND origin != '' AND toDate(created_at) > now() - INTERVAL 30 DAY ORDER BY origin ASC`,
      );

      return res.sort((a, b) =>
        a.origin
          .replace(/https?:\/\//, '')
          .localeCompare(b.origin.replace(/https?:\/\//, '')),
      );
    }),
});
