// `protectedProcedure` runs `enforceUserIsAuthed` + `enforceAccess` BEFORE the
// input parser. The explicit checks in the handlers below stay: `enforceAccess`
// only sees a TOP-LEVEL `projectId` / `organizationId`, so anything resolved
// from another id needs its own.
//
// The per-project access ladder itself is bound once, in auth.service.ts; every
// procedure here reaches it through `ctx.services.auth`.

import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../../rpc/base';
import { Arctic, googleGscClient } from '../auth/auth.service';
import { zRange, zTimeInterval } from '../report/report.constants';

const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;

const zGscDateInput = z.object({
  projectId: z.string(),
  range: zRange,
  interval: zTimeInterval.optional().default('day'),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

const GSC_OVERVIEW_INTERVALS = ['day', 'week', 'month'] as const;

function toOverviewInterval(
  interval: string
): (typeof GSC_OVERVIEW_INTERVALS)[number] {
  return (GSC_OVERVIEW_INTERVALS as readonly string[]).includes(interval)
    ? (interval as (typeof GSC_OVERVIEW_INTERVALS)[number])
    : 'day';
}

export const gscRouter = createTRPCRouter({
  getConnection: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'read',
      });
      return ctx.services.gsc.getConnection(projectId);
    }),

  initiateOAuth: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input: { projectId }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'write',
      });

      const state = Arctic.generateState();
      const codeVerifier = Arctic.generateCodeVerifier();
      const url = googleGscClient(ctx.config).createAuthorizationURL(
        state,
        codeVerifier,
        ['https://www.googleapis.com/auth/webmasters.readonly']
      );
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');

      const cookieOpts = { maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS, signed: true };
      ctx.setCookie('gsc_oauth_state', state, cookieOpts);
      ctx.setCookie('gsc_code_verifier', codeVerifier, cookieOpts);
      ctx.setCookie('gsc_project_id', projectId, cookieOpts);

      return { url: url.toString() };
    }),

  getSites: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'read',
      });
      return ctx.services.gsc.listSites(projectId);
    }),

  selectSite: protectedProcedure
    .input(z.object({ projectId: z.string(), siteUrl: z.string() }))
    .mutation(async ({ input: { projectId, siteUrl }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'write',
      });

      await ctx.services.gsc.selectSite(projectId, siteUrl);
      return { ok: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input: { projectId }, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId,
        level: 'write',
      });

      await ctx.services.gsc.disconnect(projectId);
      return { ok: true };
    }),

  getOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getOverview(
        input.projectId,
        startDate,
        endDate,
        toOverviewInterval(input.interval)
      );
    }),

  getPages: protectedProcedure
    .input(
      zGscDateInput.extend({
        limit: z.number().min(1).max(10_000).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getPages(
        input.projectId,
        startDate,
        endDate,
        input.limit
      );
    }),

  getPageDetails: protectedProcedure
    .input(zGscDateInput.extend({ page: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getPageDetails(
        input.projectId,
        input.page,
        startDate,
        endDate
      );
    }),

  getQueryDetails: protectedProcedure
    .input(zGscDateInput.extend({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getQueryDetails(
        input.projectId,
        input.query,
        startDate,
        endDate
      );
    }),

  getQueries: protectedProcedure
    .input(
      zGscDateInput.extend({
        limit: z.number().min(1).max(1000).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getQueries(
        input.projectId,
        startDate,
        endDate,
        input.limit
      );
    }),

  getSearchEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getSearchEngines(
        input.projectId,
        startDate,
        endDate
      );
    }),

  getAiEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getAiEngines(input.projectId, startDate, endDate);
    }),

  getPreviousOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getPreviousOverview(
        input.projectId,
        startDate,
        endDate,
        toOverviewInterval(input.interval)
      );
    }),

  getCannibalization: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await ctx.services.auth.requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'read',
      });
      const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
        input.projectId,
        input
      );
      return ctx.services.gsc.getCannibalization(
        input.projectId,
        startDate,
        endDate
      );
    }),
});
