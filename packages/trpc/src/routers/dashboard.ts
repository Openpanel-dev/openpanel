import { PrismaError } from 'prisma-error-enum';
import { z } from 'zod';

import { db, getDashboardsByProjectId, getId } from '@openpanel/db';
import type { Prisma } from '@openpanel/db';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(async ({ input }) => {
      return getDashboardsByProjectId(input.projectId);
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
        organizationSlug: z.string(),
      })
    )
    .mutation(async ({ input: { organizationSlug, projectId, name } }) => {
      return db.dashboard.create({
        data: {
          id: await getId('dashboard', name),
          projectId: projectId,
          organizationSlug: organizationSlug,
          organizationId: organizationSlug,
          name,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(({ input }) => {
      return db.dashboard.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        forceDelete: z.boolean().optional(),
      })
    )
    .mutation(async ({ input: { id, forceDelete } }) => {
      try {
        if (forceDelete) {
          await db.report.deleteMany({
            where: {
              dashboardId: id,
            },
          });
        }
        await db.dashboard.delete({
          where: {
            id,
          },
        });
      } catch (e) {
        // Below does not work...
        // error instanceof Prisma.PrismaClientKnownRequestError
        if (typeof e === 'object' && e && 'code' in e) {
          const error = e as Prisma.PrismaClientKnownRequestError;
          switch (error.code) {
            case PrismaError.ForeignConstraintViolation:
              throw new Error(
                'Cannot delete dashboard with associated reports'
              );
            default:
              throw new Error('Unknown error deleting dashboard');
          }
        }
      }
    }),
});
