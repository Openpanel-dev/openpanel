import { Arctic, googleGsc } from '@openpanel/auth';
import {
  db,
  getGscOverview,
  getGscPages,
  getGscQueries,
  listGscSites,
} from '@openpanel/db';
import { gscQueue } from '@openpanel/queue';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

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
        'https://www.googleapis.com/auth/webmaster.readonly',
      ]);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');

      return {
        url: url.toString(),
        state,
        codeVerifier,
        projectId: input.projectId,
      };
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
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
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
      return getGscOverview(input.projectId, input.startDate, input.endDate);
    }),

  getPages: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
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
      return getGscPages(
        input.projectId,
        input.startDate,
        input.endDate,
        input.limit
      );
    }),

  getQueries: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
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
      return getGscQueries(
        input.projectId,
        input.startDate,
        input.endDate,
        input.limit
      );
    }),
});
