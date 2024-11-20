import { PrismaError } from 'prisma-error-enum';
import { z } from 'zod';

import {
  db,
  getDashboardsByProjectId,
  getId,
  getProjectById,
} from '@openpanel/db';
import type { Prisma } from '@openpanel/db';

import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(({ input }) => {
      return getDashboardsByProjectId(input.projectId);
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const project = await getProjectById(input.projectId);

      if (!project) {
        throw TRPCNotFoundError('Project not found');
      }

      return db.dashboard.create({
        data: {
          id: await getId('dashboard', input.name),
          projectId: input.projectId,
          organizationId: project.organizationId,
          name: input.name,
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      const access = await getProjectAccess({
        projectId: dashboard.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this dashboard');
      }

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
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: {
          id: input.id,
        },
      });

      const access = await getProjectAccess({
        projectId: dashboard.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this dashboard');
      }

      try {
        if (input.forceDelete) {
          await db.report.deleteMany({
            where: {
              dashboardId: input.id,
            },
          });
        }
        await db.dashboard.delete({
          where: {
            id: input.id,
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
                'Cannot delete dashboard with associated reports',
              );
            default:
              throw new Error('Unknown error deleting dashboard');
          }
        }
      }
    }),
});
