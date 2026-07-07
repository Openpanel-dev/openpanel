import { PrismaError } from 'prisma-error-enum';
import { z } from 'zod';

import {
  db,
  getDashboardById,
  getDashboardsForUser,
  getId,
  getProjectById,
  getProjectMembers,
} from '@openpanel/db';
import type { Prisma } from '@openpanel/db';

import {
  canEditDashboard,
  canManageDashboard,
  getDashboardAccess,
  getOrganizationAccess,
  getProjectAccess,
} from '../access';
import {
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const project = await getProjectById(input.projectId);

      if (!project) {
        throw new TRPCNotFoundError('Project not found');
      }

      const member = await getOrganizationAccess({
        userId: ctx.session.userId,
        organizationId: project.organizationId,
      });

      return getDashboardsForUser({
        projectId: input.projectId,
        userId: ctx.session.userId,
        isAdmin: member?.role === 'org:admin',
      });
    }),
  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.id,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      const dashboard = await getDashboardById(input.id, input.projectId);

      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return { ...dashboard, role: access.role };
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
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const project = await getProjectById(input.projectId);

      if (!project) {
        throw new TRPCNotFoundError('Project not found');
      }

      return db.dashboard.create({
        data: {
          id: await getId('dashboard', input.name),
          projectId: input.projectId,
          organizationId: project.organizationId,
          name: input.name,
          createdById: ctx.session.userId,
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
      const access = await getDashboardAccess({
        dashboardId: input.id,
        userId: ctx.session.userId,
      });

      if (!access || !canEditDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
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
      const access = await getDashboardAccess({
        dashboardId: input.id,
        userId: ctx.session.userId,
      });

      if (!access || !canManageDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
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
  copyToMine: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.id,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      const [dashboard, reports] = await Promise.all([
        db.dashboard.findUniqueOrThrow({ where: { id: input.id } }),
        db.report.findMany({
          where: { dashboardId: input.id },
          include: { layout: true },
        }),
      ]);

      const name = `${dashboard.name} (copy)`;

      return db.$transaction(async (tx) => {
        const newDashboard = await tx.dashboard.create({
          data: {
            id: await getId('dashboard', name),
            projectId: dashboard.projectId,
            organizationId: dashboard.organizationId,
            name,
            createdById: ctx.session.userId,
          },
        });

        for (const report of reports) {
          await tx.report.create({
            data: {
              projectId: report.projectId,
              dashboardId: newDashboard.id,
              name: report.name,
              interval: report.interval,
              range: report.range,
              chartType: report.chartType,
              lineType: report.lineType,
              breakdowns: report.breakdowns as Prisma.InputJsonValue,
              events: report.events as Prisma.InputJsonValue,
              globalFilters: report.globalFilters as Prisma.InputJsonValue,
              formula: report.formula,
              unit: report.unit,
              metric: report.metric,
              previous: report.previous,
              criteria: report.criteria,
              funnelGroup: report.funnelGroup,
              funnelWindow: report.funnelWindow,
              options: report.options as Prisma.InputJsonValue,
              visibleSeries: report.visibleSeries,
              startDate: report.startDate,
              endDate: report.endDate,
              layout: report.layout
                ? {
                    create: {
                      x: report.layout.x,
                      y: report.layout.y,
                      w: report.layout.w,
                      h: report.layout.h,
                      minW: report.layout.minW,
                      minH: report.layout.minH,
                      maxW: report.layout.maxW,
                      maxH: report.layout.maxH,
                    },
                  }
                : undefined,
            },
          });
        }

        return newDashboard;
      });
    }),
  listAccess: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.dashboardId,
        userId: ctx.session.userId,
      });

      if (!access || !canManageDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
      }

      return db.dashboardAccess.findMany({
        where: { dashboardId: input.dashboardId },
        include: { user: true },
      });
    }),
  share: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        userId: z.string(),
        level: z.enum(['view', 'edit']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.dashboardId,
        userId: ctx.session.userId,
      });

      if (!access || !canManageDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
      }

      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: { id: input.dashboardId },
      });

      if (dashboard.createdById === input.userId) {
        throw new TRPCBadRequestError(
          'This user already owns the dashboard',
        );
      }

      return db.dashboardAccess.upsert({
        where: {
          dashboardId_userId: {
            dashboardId: input.dashboardId,
            userId: input.userId,
          },
        },
        create: {
          dashboardId: input.dashboardId,
          userId: input.userId,
          level: input.level,
        },
        update: {
          level: input.level,
        },
      });
    }),
  unshare: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        userId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.dashboardId,
        userId: ctx.session.userId,
      });

      if (!access || !canManageDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
      }

      await db.dashboardAccess.delete({
        where: {
          dashboardId_userId: {
            dashboardId: input.dashboardId,
            userId: input.userId,
          },
        },
      });
    }),
  shareWithAllMembers: protectedProcedure
    .input(
      z.object({
        dashboardId: z.string(),
        level: z.enum(['view', 'edit']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getDashboardAccess({
        dashboardId: input.dashboardId,
        userId: ctx.session.userId,
      });

      if (!access || !canManageDashboard(access.role)) {
        throw new TRPCForbiddenError('You do not have access to this dashboard');
      }

      const dashboard = await db.dashboard.findUniqueOrThrow({
        where: { id: input.dashboardId },
      });

      const members = await getProjectMembers(dashboard.projectId);
      const recipients = members.filter(
        (user) => user.id !== dashboard.createdById,
      );

      await db.$transaction(
        recipients.map((user) =>
          db.dashboardAccess.upsert({
            where: {
              dashboardId_userId: {
                dashboardId: input.dashboardId,
                userId: user.id,
              },
            },
            create: {
              dashboardId: input.dashboardId,
              userId: user.id,
              level: input.level,
            },
            update: {
              level: input.level,
            },
          }),
        ),
      );

      return { count: recipients.length };
    }),
});
