import { Arctic, googleGsc } from '@openpanel/auth';
import {
  chQuery,
  db,
  getChartStartEndDate,
  getGscCannibalization,
  getGscOverview,
  getGscPageDetails,
  getGscPages,
  getGscQueries,
  getGscQueryDetails,
  getSettingsForProject,
  listGscSites,
  TABLE_NAMES,
} from '@openpanel/db';
import { gscQueue } from '@openpanel/queue';
import { zRange, zTimeInterval } from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const zGscDateInput = z.object({
  projectId: z.string(),
  range: zRange,
  interval: zTimeInterval.optional().default('day'),
});

async function resolveDates(
  projectId: string,
  input: { range: string; startDate?: string; endDate?: string }
) {
  const { timezone } = await getSettingsForProject(projectId);
  const { startDate, endDate } = getChartStartEndDate(
    {
      range: input.range as any,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    timezone
  );
  return {
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
  };
}

export const gscRouter = createTRPCRouter({
  getConnection: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      return db.gscConnection.findUnique({
        where: { projectId: input.projectId },
        select: {
          id: true,
          siteUrl: true,
          lastSyncedAt: true,
          lastSyncStatus: true,
          lastSyncError: true,
          backfillStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }),

  initiateOAuth: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const state = Arctic.generateState();
      const codeVerifier = Arctic.generateCodeVerifier();
      const url = googleGsc.createAuthorizationURL(state, codeVerifier, [
        'https://www.googleapis.com/auth/webmasters.readonly',
      ]);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');

      const cookieOpts = { maxAge: 60 * 10 };
      ctx.setCookie('gsc_oauth_state', state, cookieOpts);
      ctx.setCookie('gsc_code_verifier', codeVerifier, cookieOpts);
      ctx.setCookie('gsc_project_id', input.projectId, cookieOpts);

      return { url: url.toString() };
    }),

  getSites: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      return listGscSites(input.projectId);
    }),

  selectSite: protectedProcedure
    .input(z.object({ projectId: z.string(), siteUrl: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      const conn = await db.gscConnection.findUnique({
        where: { projectId: input.projectId },
      });
      if (!conn) {
        throw TRPCNotFoundError('GSC connection not found');
      }

      await db.gscConnection.update({
        where: { projectId: input.projectId },
        data: {
          siteUrl: input.siteUrl,
          backfillStatus: 'pending',
        },
      });

      await gscQueue.add('gscProjectBackfill', {
        type: 'gscProjectBackfill',
        payload: { projectId: input.projectId },
      });

      return { ok: true };
    }),

  disconnect: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      await db.gscConnection.deleteMany({
        where: { projectId: input.projectId },
      });

      return { ok: true };
    }),

  getOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
      const interval = ['day', 'week', 'month'].includes(input.interval)
        ? (input.interval as 'day' | 'week' | 'month')
        : 'day';
      return getGscOverview(input.projectId, startDate, endDate, interval);
    }),

  getPages: protectedProcedure
    .input(
      zGscDateInput.extend({
        limit: z.number().min(1).max(1000).optional().default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
      return getGscPages(input.projectId, startDate, endDate, input.limit);
    }),

  getPageDetails: protectedProcedure
    .input(zGscDateInput.extend({ page: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
      return getGscPageDetails(input.projectId, input.page, startDate, endDate);
    }),

  getQueryDetails: protectedProcedure
    .input(zGscDateInput.extend({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
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
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
      return getGscQueries(input.projectId, startDate, endDate, input.limit);
    }),

  getSearchEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);

      const startMs = new Date(startDate).getTime();
      const duration = new Date(endDate).getTime() - startMs;
      const prevEnd = new Date(startMs - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const [engines, [prevResult]] = await Promise.all([
        chQuery<{ name: string; sessions: number }>(
          `SELECT
            referrer_name as name,
            count(*) as sessions
          FROM ${TABLE_NAMES.sessions}
          WHERE project_id = '${input.projectId}'
            AND referrer_type = 'search'
            AND created_at >= '${startDate}'
            AND created_at <= '${endDate}'
          GROUP BY referrer_name
          ORDER BY sessions DESC
          LIMIT 10`
        ),
        chQuery<{ sessions: number }>(
          `SELECT count(*) as sessions
          FROM ${TABLE_NAMES.sessions}
          WHERE project_id = '${input.projectId}'
            AND referrer_type = 'search'
            AND created_at >= '${fmt(prevStart)}'
            AND created_at <= '${fmt(prevEnd)}'`
        ),
      ]);

      return {
        engines,
        total: engines.reduce((s, e) => s + e.sessions, 0),
        previousTotal: prevResult?.sessions ?? 0,
      };
    }),

  getAiEngines: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);

      const startMs = new Date(startDate).getTime();
      const duration = new Date(endDate).getTime() - startMs;
      const prevEnd = new Date(startMs - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      // Known AI referrer names — will switch to referrer_type = 'ai' once available
      const aiNames = [
        'chatgpt.com',
        'openai.com',
        'claude.ai',
        'anthropic.com',
        'perplexity.ai',
        'gemini.google.com',
        'copilot.com',
        'grok.com',
        'mistral.ai',
        'kagi.com',
      ]
        .map((n) => `'${n}', '${n.replace(/\.[^.]+$/, '')}'`)
        .join(', ');

      const where = (start: string, end: string) =>
        `project_id = '${input.projectId}'
          AND referrer_name IN (${aiNames})
          AND created_at >= '${start}'
          AND created_at <= '${end}'`;

      const [engines, [prevResult]] = await Promise.all([
        chQuery<{ referrer_name: string; sessions: number }>(
          `SELECT lower(
            regexp_replace(referrer_name, '^https?://', '')
          ) as referrer_name, count(*) as sessions
          FROM ${TABLE_NAMES.sessions}
          WHERE ${where(startDate, endDate)}
          GROUP BY referrer_name
          ORDER BY sessions DESC
          LIMIT 10`
        ),
        chQuery<{ sessions: number }>(
          `SELECT count(*) as sessions
          FROM ${TABLE_NAMES.sessions}
          WHERE ${where(fmt(prevStart), fmt(prevEnd))}`
        ),
      ]);

      return {
        engines: engines.map((e) => ({
          name: e.referrer_name,
          sessions: e.sessions,
        })),
        total: engines.reduce((s, e) => s + e.sessions, 0),
        previousTotal: prevResult?.sessions ?? 0,
      };
    }),

  getPreviousOverview: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);

      const startMs = new Date(startDate).getTime();
      const duration = new Date(endDate).getTime() - startMs;
      const prevEnd = new Date(startMs - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const interval = (['day', 'week', 'month'] as const).includes(
        input.interval as 'day' | 'week' | 'month'
      )
        ? (input.interval as 'day' | 'week' | 'month')
        : 'day';

      return getGscOverview(
        input.projectId,
        fmt(prevStart),
        fmt(prevEnd),
        interval
      );
    }),

  getCannibalization: protectedProcedure
    .input(zGscDateInput)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }
      const { startDate, endDate } = await resolveDates(input.projectId, input);
      // Clear stale cache so hash-stripping fix applies immediately
      await getGscCannibalization.clear(input.projectId, startDate, endDate);
      return getGscCannibalization(input.projectId, startDate, endDate);
    }),
});
