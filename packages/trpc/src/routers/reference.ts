import { z } from 'zod';

import { db, getChartStartEndDate, getSettingsForProject } from '@openpanel/db';
import { zCreateReference, zRange } from '@openpanel/validation';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

export const referenceRouter = createTRPCRouter({
  getReferences: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
      }),
    )
    .query(async ({ input: { projectId, cursor }, ctx }) => {
      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.reference.findMany({
        where: {
          projectId,
        },
        take: 50,
        skip: cursor ? cursor * 50 : 0,
      });
    }),

  create: protectedProcedure
    .input(zCreateReference)
    .mutation(
      async ({ input: { title, description, datetime, projectId } }) => {
        return db.reference.create({
          data: {
            title,
            description,
            projectId,
            date: new Date(datetime),
          },
        });
      },
    ),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullish(),
        datetime: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.reference.findUniqueOrThrow({
        where: { id: input.id },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: existing.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.reference.update({
        where: { id: input.id },
        data: {
          title: input.title,
          description: input.description ?? null,
          date: new Date(input.datetime),
        },
      });
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id }, ctx }) => {
      const reference = await db.reference.findUniqueOrThrow({
        where: {
          id,
        },
      });

      const access = await getProjectAccess({
        userId: ctx.session.userId,
        projectId: reference.projectId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.reference.delete({
        where: {
          id,
        },
      });
    }),
  getChartReferences: publicProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string().nullish(),
        endDate: z.string().nullish(),
        range: zRange,
      }),
    )
    .query(async ({ input: { projectId, ...input } }) => {
      const { timezone } = await getSettingsForProject(projectId);
      const { startDate, endDate } = getChartStartEndDate(input, timezone);
      return db.reference.findMany({
        where: {
          projectId,
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
      });
    }),
});
