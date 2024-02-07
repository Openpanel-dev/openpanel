import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { db, getId } from '@/server/db';
import { PrismaError } from 'prisma-error-enum';
import { z } from 'zod';

import type { Prisma } from '@mixan/db';

export const dashboardRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return db.dashboard.findUnique({
        where: {
          id: input.id,
        },
      });
    }),
  list: protectedProcedure
    .input(
      z
        .object({
          projectId: z.string(),
        })
        .or(
          z.object({
            organizationId: z.string(),
          })
        )
    )
    .query(async ({ input }) => {
      if ('projectId' in input) {
        return db.dashboard.findMany({
          where: {
            project_id: input.projectId,
          },
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            project: true,
          },
        });
      } else {
        return db.dashboard.findMany({
          where: {
            project: {
              organization_slug: input.organizationId,
            },
          },
          include: {
            project: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
      }
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
          project_id: projectId,
          organization_slug: organizationSlug,
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
              dashboard_id: id,
            },
          });
        }
        await db.recentDashboards.deleteMany({
          where: {
            dashboard_id: id,
          },
        });
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
