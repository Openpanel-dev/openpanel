// Ported from packages/trpc/src/routers/share.ts (M6-004).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's share functions (DELEGATE
// PATTERN).
//
// M10-003: the handler bodies reach the module through `ctx.services.share`,
// so the requestId minted at the edge reaches the Postgres call (ADR-018).
//
// The permission ladder itself is bound once, in auth.service.ts
// (M10-002); every procedure here reaches it through `ctx.services.auth`. `createOverview` has no access
// check here either — same gap V1's router has (ported verbatim, not fixed).

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from './share.constants';

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const shareRouter = createTRPCRouter({
  overview: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareOverview(input.shareId, ctx.cookies)
    ),

  overviewSettings: procedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.share.getShareOverviewSettings(input.projectId);
    }),

  createOverview: procedure.input(zShareOverview).mutation(({ input, ctx }) => {
    requireLogin(ctx.session.userId);
    return ctx.services.share.createShareOverview(input);
  }),

  dashboard: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareDashboard(input.shareId, ctx.cookies)
    ),

  dashboardSettings: procedure
    .input(z.object({ projectId: z.string(), dashboardId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.share.getShareDashboardSettings(
        input.projectId,
        input.dashboardId
      );
    }),

  createDashboard: procedure
    .input(zShareDashboard)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.share.createShareDashboard(input);
    }),

  dashboardReports: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareDashboardReports(input.shareId, ctx.cookies)
    ),

  report: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      ctx.services.share.getShareReport(input.shareId, ctx.cookies)
    ),

  reportSettings: procedure
    .input(z.object({ projectId: z.string(), reportId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return ctx.services.share.getShareReportSettings(
        input.projectId,
        input.reportId
      );
    }),

  createReport: procedure
    .input(zShareReport)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await ctx.services.auth.requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return ctx.services.share.createShareReport(input);
    }),
});
