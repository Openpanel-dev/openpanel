// Ported from packages/trpc/src/routers/gsc.ts (M5-002).
//
// V1's `protectedProcedure` — the logger/session-scope/rate-limit middleware
// stack — lands in core with auth (rpc/base.ts: "those need the resolved
// Session shape and the access rules, so they land with auth (P6)"). Until
// then this router does its own minimal "is anyone logged in" check inline,
// exactly like V1's `enforceUserIsAuthed`. V1 keeps serving the live route
// through packages/trpc's own `protectedProcedure` (full stack included) and
// delegates its handler bodies to `ctx.services.gsc` (DELEGATE PATTERN),
// so nothing here is a live regression.
//
// The per-project access ladder itself IS shared: `./src/access.ts` binds
// core's shared/access.ts ladder to @openpanel/db's real lookups, the same
// way packages/trpc/src/access.ts does for V1.

import { zRange, zTimeInterval } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, procedure } from '../../rpc/base';
import { TRPCAccessError } from '../../rpc/errors';
import { Arctic, googleGsc } from '../auth/auth.service';

// Lazy, deliberately: ./src/access reaches @openpanel/db's real lookups,
// which construct a real pino logger — with a transport worker thread — at
// import time. See gsc.service.ts's header for the full reasoning.
function loadAccessChecks() {
  return import('./src/access');
}

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

function requireLogin(userId: string | null | undefined): string {
  if (!userId) {
    throw new TRPCAccessError('Not authenticated');
  }
  return userId;
}

async function requireRead(userId: string, projectId: string) {
  const { requireProjectAccess } = await loadAccessChecks();
  await requireProjectAccess({ userId, projectId, level: 'read' });
}

async function requireWrite(userId: string, projectId: string) {
  const { requireProjectAccess } = await loadAccessChecks();
  await requireProjectAccess({ userId, projectId, level: 'write' });
}

export const gscRouter = createTRPCRouter({
  getConnection: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, projectId);
      return ctx.services.gsc.getConnection(projectId);
    }),

  initiateOAuth: procedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireWrite(userId, projectId);

      const state = Arctic.generateState();
      const codeVerifier = Arctic.generateCodeVerifier();
      const url = googleGsc.createAuthorizationURL(state, codeVerifier, [
        'https://www.googleapis.com/auth/webmasters.readonly',
      ]);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');

      const cookieOpts = { maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS, signed: true };
      ctx.setCookie('gsc_oauth_state', state, cookieOpts);
      ctx.setCookie('gsc_code_verifier', codeVerifier, cookieOpts);
      ctx.setCookie('gsc_project_id', projectId, cookieOpts);

      return { url: url.toString() };
    }),

  getSites: procedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, projectId);
      return ctx.services.gsc.listSites(projectId);
    }),

  selectSite: procedure
    .input(z.object({ projectId: z.string(), siteUrl: z.string() }))
    .mutation(async ({ input: { projectId, siteUrl }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireWrite(userId, projectId);

      await ctx.services.gsc.selectSite(projectId, siteUrl);
      return { ok: true };
    }),

  disconnect: procedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input: { projectId }, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireWrite(userId, projectId);

      await ctx.services.gsc.disconnect(projectId);
      return { ok: true };
    }),

  getOverview: procedure.input(zGscDateInput).query(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireRead(userId, input.projectId);
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

  getPages: procedure
    .input(
      zGscDateInput.extend({
        limit: z.number().min(1).max(10_000).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getPageDetails: procedure
    .input(zGscDateInput.extend({ page: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getQueryDetails: procedure
    .input(zGscDateInput.extend({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getQueries: procedure
    .input(
      zGscDateInput.extend({
        limit: z.number().min(1).max(1000).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getSearchEngines: procedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getAiEngines: procedure.input(zGscDateInput).query(async ({ input, ctx }) => {
    const userId = requireLogin(ctx.session.userId);
    await requireRead(userId, input.projectId);
    const { startDate, endDate } = await ctx.services.gsc.resolveDateRange(
      input.projectId,
      input
    );
    return ctx.services.gsc.getAiEngines(input.projectId, startDate, endDate);
  }),

  getPreviousOverview: procedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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

  getCannibalization: procedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const userId = requireLogin(ctx.session.userId);
      await requireRead(userId, input.projectId);
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
