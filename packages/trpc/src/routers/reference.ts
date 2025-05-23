import { z } from 'zod';

import { db, getReferences, getSettingsForProject } from '@openpanel/db';
import { zCreateReference, zRange } from '@openpanel/validation';

import { getProjectAccess } from '../access';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { getChartStartEndDate } from './chart.helpers';

export const referenceRouter = createTRPCRouter({
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
      return getReferences({
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
