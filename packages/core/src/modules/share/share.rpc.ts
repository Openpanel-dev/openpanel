// Ported from packages/trpc/src/routers/share.ts (M6-004).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to core's share functions (DELEGATE
// PATTERN) — this module has no queue/cron of its own, so there is no
// `ctx.services.share`, same as `user`/`project`.
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1. `createOverview` has no access
// check here either — same gap V1's router has (ported verbatim, not fixed).

import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { zShareDashboard, zShareOverview, zShareReport } from './share.constants';
import {
  createShareDashboard,
  createShareOverview,
  createShareReport,
  getShareDashboard,
  getShareDashboardReports,
  getShareDashboardSettings,
  getShareOverview,
  getShareOverviewSettings,
  getShareReport,
  getShareReportSettings,
} from './share.service';

function loadAccessChecks() {
  return import('./src/access');
}

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

export const shareRouter = createTRPCRouter({
  overview: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareOverview(input.shareId, ctx.cookies)),

  overviewSettings: procedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return getShareOverviewSettings(input.projectId);
    }),

  createOverview: procedure
    .input(zShareOverview)
    .mutation(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return createShareOverview(input);
    }),

  dashboard: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareDashboard(input.shareId, ctx.cookies)),

  dashboardSettings: procedure
    .input(z.object({ projectId: z.string(), dashboardId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return getShareDashboardSettings(input.projectId, input.dashboardId);
    }),

  createDashboard: procedure
    .input(zShareDashboard)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return createShareDashboard(input);
    }),

  dashboardReports: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) =>
      getShareDashboardReports(input.shareId, ctx.cookies)
    ),

  report: procedure
    .input(z.object({ shareId: z.string() }))
    .query(({ input, ctx }) => getShareReport(input.shareId, ctx.cookies)),

  reportSettings: procedure
    .input(z.object({ projectId: z.string(), reportId: z.string() }))
    .query(({ input, ctx }) => {
      requireLogin(ctx.session.userId);
      return getShareReportSettings(input.projectId, input.reportId);
    }),

  createReport: procedure
    .input(zShareReport)
    .mutation(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      const { requireProjectAccess } = await loadAccessChecks();
      await requireProjectAccess({
        userId,
        projectId: input.projectId,
        level: 'write',
      });
      return createShareReport(input);
    }),
});
