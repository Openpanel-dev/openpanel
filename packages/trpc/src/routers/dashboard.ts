import { PrismaError } from 'prisma-error-enum';
import { z } from 'zod';

import {
  db,
  getDashboardById,
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
  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const dashboard = await getDashboardById(input.id, input.projectId);

      if (!dashboard) {
        throw TRPCNotFoundError('Dashboard not found');
      }

      return dashboard;
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
  duplicate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          reports: {
            include: { layout: true },
          },
        },
      });

      const access = await getProjectAccess({
        projectId: dashboard.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw TRPCAccessError('You do not have access to this dashboard');
      }

      const newDashboardId = await getId(
        'dashboard',
        `Copy of ${dashboard.name}`,
      );

      return db.$transaction(async (tx) => {
        const newDashboard = await tx.dashboard.create({
          data: {
            id: newDashboardId,
            name: `Copy of ${dashboard.name}`,
            projectId: dashboard.projectId,
            organizationId: dashboard.organizationId,
          },
        });

        for (const report of dashboard.reports) {
          const newReport = await tx.report.create({
            data: {
              projectId: report.projectId,
              dashboardId: newDashboard.id,
              name: report.name,
              events: report.events!,
              interval: report.interval,
              breakdowns: report.breakdowns!,
              chartType: report.chartType,
              lineType: report.lineType,
              range: report.range,
              formula: report.formula,
              previous: report.previous,
              unit: report.unit,
              criteria: report.criteria,
              metric: report.metric,
              funnelGroup: report.funnelGroup,
              funnelWindow: report.funnelWindow,
              globalFilters: report.globalFilters ?? [],
              holdProperties: report.holdProperties ?? [],
              hiddenSeries: (report.hiddenSeries as string[]) ?? [],
              measuring: report.measuring,
            },
          });

          if (report.layout) {
            await tx.reportLayout.create({
              data: {
                reportId: newReport.id,
                x: report.layout.x,
                y: report.layout.y,
                w: report.layout.w,
                h: report.layout.h,
                minW: report.layout.minW,
                minH: report.layout.minH,
                maxW: report.layout.maxW,
                maxH: report.layout.maxH,
              },
            });
          }
        }

        return newDashboard;
      });
    }),
});
