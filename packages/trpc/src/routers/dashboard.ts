// Dissolved into @openpanel/core's dashboard module (M7-006): the reads plus
// the create/update/delete mutation bodies moved to
// packages/core/src/modules/dashboard/dashboard.service.ts. This router
// stays (DELEGATE PATTERN) — it keeps V1's `protectedProcedure` stack and
// delegates every handler body to core's dashboard functions, same as
// overview.ts/chart.ts.

import {
  createDashboard,
  deleteDashboard,
  getDashboardById,
  getDashboardByIdOrThrow,
  getDashboardsByProjectId,
  updateDashboard,
} from '@openpanel/core';
import { z } from 'zod';
import { getProjectAccess, requireProjectAccess } from '../access';
import { TRPCForbiddenError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const dashboardRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(({ input }) => {
      return getDashboardsByProjectId(input.projectId);
    }),
  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });

      if (!access) {
        throw new TRPCForbiddenError('You do not have access to this project');
      }

      const dashboard = await getDashboardById(input.id, input.projectId);

      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return dashboard;
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      return createDashboard(input);
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await getDashboardByIdOrThrow(input.id);

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dashboard.projectId,
        level: 'write',
      });

      return updateDashboard(input);
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        forceDelete: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await getDashboardByIdOrThrow(input.id);

      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: dashboard.projectId,
        level: 'write',
      });

      return deleteDashboard(input);
    }),
});
