import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from '@/trpc/api/trpc';
import { z } from 'zod';

import { db, getReferences } from '@openpanel/db';
import { zCreateReference, zRange } from '@openpanel/validation';

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
      }
    ),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input: { id } }) => {
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
      })
    )
    .query(({ input: { projectId, ...input } }) => {
      const { startDate, endDate } = getChartStartEndDate(input);
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
