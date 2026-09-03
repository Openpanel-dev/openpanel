// Dissolved into @openpanel/core's gsc module (M5-002): the OAuth token
// lifecycle, the Search Console client, the ClickHouse read path and the
// AI/search-engine breakdown logic moved to
// packages/core/src/modules/gsc/gsc.service.ts. This router stays
// (DELEGATE PATTERN): it keeps V1's protectedProcedure stack (session/access/
// logger/rate-limit middleware) and its own gscConnection CRUD untouched, and
// delegates every read/write of GSC data to the core service.
import {
  Arctic,
  disconnectGscConnection,
  getGscAiEngines,
  getGscCannibalization,
  getGscConnection,
  getGscOverview,
  getGscPageDetails,
  getGscPages,
  getGscPreviousOverview,
  getGscQueries,
  getGscQueryDetails,
  getGscSearchEngines,
  googleGsc,
  listGscSites,
  resolveGscDateRange,
  selectGscSite,
} from '@openpanel/core';
import { gscQueue } from '@openpanel/queue';
import { zRange, zTimeInterval } from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess, requireProjectAccess } from '../access';
import { TRPCForbiddenError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const OAUTH_COOKIE_MAX_AGE_SECONDS = 60 * 10;
const GSC_OVERVIEW_INTERVALS = ['day', 'week', 'month'] as const;

const zGscDateInput = z.object({
  projectId: z.string(),
  range: zRange,
  interval: zTimeInterval.optional().default('day'),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
});

function toOverviewInterval(
  interval: string
): (typeof GSC_OVERVIEW_INTERVALS)[number] {
  return (GSC_OVERVIEW_INTERVALS as readonly string[]).includes(interval)
    ? (interval as (typeof GSC_OVERVIEW_INTERVALS)[number])
    : 'day';
}

async function requireRead(userId: string, projectId: string) {
  const access = await getProjectAccess({ userId, projectId });
  if (!access) {
    throw new TRPCForbiddenError('You do not have access to this project');
  }
}

export const gscRouter = createTRPCRouter({
  getConnection: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      return getGscConnection(input.projectId);
    }),

  initiateOAuth: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

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
      ctx.setCookie('gsc_project_id', input.projectId, cookieOpts);

      return { url: url.toString() };
    }),

  getSites: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      return listGscSites(input.projectId);
    }),

  selectSite: protectedProcedure
    .input(z.object({ projectId: z.string(), siteUrl: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      await selectGscSite(input.projectId, input.siteUrl);

      await gscQueue.add('gscProjectBackfill', {
        type: 'gscProjectBackfill',
        payload: { projectId: input.projectId },
      });

      return { ok: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      await disconnectGscConnection(input.projectId);
      return { ok: true };
    }),

  getOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscOverview(
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
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscPages(input.projectId, startDate, endDate, input.limit);
    }),

  getPageDetails: protectedProcedure
    .input(zGscDateInput.extend({ page: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscPageDetails(input.projectId, input.page, startDate, endDate);
    }),

  getQueryDetails: protectedProcedure
    .input(zGscDateInput.extend({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscQueryDetails(
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
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscQueries(input.projectId, startDate, endDate, input.limit);
    }),

  getSearchEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscSearchEngines(input.projectId, startDate, endDate);
    }),

  getAiEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscAiEngines(input.projectId, startDate, endDate);
    }),

  getPreviousOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscPreviousOverview(
        input.projectId,
        startDate,
        endDate,
        toOverviewInterval(input.interval)
      );
    }),

  getCannibalization: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      await requireRead(ctx.session.userId, input.projectId);
      const { startDate, endDate } = await resolveGscDateRange(
        input.projectId,
        input
      );
      return getGscCannibalization(input.projectId, startDate, endDate);
    }),
});
