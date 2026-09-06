// Ported from packages/trpc/src/routers/dashboard.ts (M7-006).
//
// M11-001: every procedure is on its V1 twin's builder.
// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE
// the input parser, exactly as V1 does. The explicit checks in the handlers
// below stay: `enforceAccess` only sees a TOP-LEVEL `projectId` /
// `organizationId`, so anything resolved from another id needs its own
// (ADR-011).
//
// The dashboardId-keyed procedures are invisible to `enforceAccess`; their
// in-handler `requireProjectAccess` through `ctx.services.auth` (M10-002) is
// the only check that fires.

import { z } from 'zod';
import {
  createTRPCRouter,
  protectedProcedure,
  type TrpcContext,
} from '../../rpc/base';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';

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
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
      })
    )
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.dashboard.getDashboardsByProjectId(input.projectId);
    }),

  byId: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireReadAccess(ctx, input.projectId);

      const dashboard = await ctx.services.dashboard.getDashboardById(
        input.id,
        input.projectId
      );

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
      await requireWriteAccess(ctx, input.projectId);
      return ctx.services.dashboard.createDashboard(input);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await ctx.services.dashboard.getDashboardByIdOrThrow(
        input.id
      );
      await requireWriteAccess(ctx, dashboard.projectId);
      return ctx.services.dashboard.updateDashboard(input);
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        forceDelete: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const dashboard = await ctx.services.dashboard.getDashboardByIdOrThrow(
        input.id
      );
      await requireWriteAccess(ctx, dashboard.projectId);
      return ctx.services.dashboard.deleteDashboard(input);
    }),
});
