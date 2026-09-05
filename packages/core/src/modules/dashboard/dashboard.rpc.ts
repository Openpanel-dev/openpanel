// Ported from packages/trpc/src/routers/dashboard.ts (M7-006).
//
// Same arrangement as project.rpc.ts: V1's `protectedProcedure` lands in
// core with auth (rpc/base.ts), so each procedure does its own "is anyone
// logged in" + `requireProjectAccess` check, reached through
// `ctx.services.auth` (M10-002). The create/update/delete mutation bodies
// moved to ./dashboard.service alongside the reads that already lived there;
// packages/trpc's dashboard router delegates every handler body onto
// ./dashboard.service while keeping V1's own procedure stack (DELEGATE
// PATTERN).

import { z } from 'zod';
import { createTRPCRouter, procedure, type TrpcContext } from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import {
  createDashboard,
  deleteDashboard,
  getDashboardById,
  getDashboardByIdOrThrow,
  getDashboardsByProjectId,
  updateDashboard,
} from './dashboard.service';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireReadAccess(ctx: TrpcContext, projectId: string) {
  await ctx.services.auth.requireProjectAccess({
    userId: requireLogin(ctx.session.userId),
    projectId,
    level: 'read',
  });
}

async function requireWriteAccess(ctx: TrpcContext, projectId: string) {
  await ctx.services.auth.requireProjectAccess({
    userId: requireLogin(ctx.session.userId),
    projectId,
    level: 'write',
  });
}

export const dashboardRouter = createTRPCRouter({
  list: procedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return getDashboardsByProjectId(input.projectId);
    }),

  byId: procedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      const dashboard = await getDashboardById(input.id, input.projectId);

      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      return dashboard;
    }),

  create: procedure
    .input(
      z.object({
        name: z.string(),
        projectId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireWriteAccess(ctx, input.projectId);
      return createDashboard(input);
    }),

  update: procedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await getDashboardByIdOrThrow(input.id);
      await requireWriteAccess(ctx, dashboard.projectId);
      return updateDashboard(input);
    }),

  delete: procedure
    .input(
      z.object({
        id: z.string(),
        forceDelete: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await getDashboardByIdOrThrow(input.id);
      await requireWriteAccess(ctx, dashboard.projectId);
      return deleteDashboard(input);
    }),
});
