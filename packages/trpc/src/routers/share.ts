import ShortUniqueId from 'short-unique-id';

import {
  db,
  getDashboardById,
  getReportById,
  getReportsByDashboardId,
  getShareDashboardById,
  transformReport,
} from '@openpanel/db';
import {
  zShareDashboard,
  zShareOverview,
  zShareReport,
} from '@openpanel/validation';

import { hashPassword } from '@openpanel/auth';
import { z } from 'zod';
import { requireProjectAccess } from '../access';
import {
  TRPCAccessError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../errors';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

const uid = new ShortUniqueId({ length: 6 });

/**
 * Share lookups are split in two on purpose.
 *
 * The `overview`/`dashboard`/`report` procedures are unauthenticated and serve
 * the public viewer, addressed only by `shareId` (the value in the share link).
 * They project an explicit allow-list of columns and refuse to hand back any
 * shared content until the `public` flag and the password cookie have both been
 * checked. Returning the row and letting the client decide is what leaked the
 * argon2 password hash and private report definitions (GHSA-7gv7-c464-9wh8).
 *
 * The `*Settings` procedures are authenticated and serve the owner's share
 * modal, addressed by the underlying object id. They never return the hash
 * either - only whether one is set.
 */

/** Shape returned to a viewer who has not unlocked a password-protected share. */
function lockedShare(
  id: string,
  organization: { name: string },
  project: { name: string },
) {
  return {
    id,
    requiresPassword: true as const,
    organization,
    project,
  };
}

export const shareRouter = createTRPCRouter({
  overview: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const share = await db.shareOverview.findUnique({
        where: { id: input.shareId },
        select: {
          id: true,
          public: true,
          password: true,
          projectId: true,
          organization: { select: { name: true } },
          project: { select: { name: true } },
        },
      });

      if (!share || !share.public) {
        throw new TRPCNotFoundError('Share not found');
      }

      const hasAccess = !!ctx.cookies[`shared-overview-${share.id}`];
      if (share.password && !hasAccess) {
        return lockedShare(share.id, share.organization, share.project);
      }

      return {
        id: share.id,
        requiresPassword: false as const,
        organization: share.organization,
        project: share.project,
        projectId: share.projectId,
      };
    }),

  overviewSettings: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const share = await db.shareOverview.findUnique({
        where: { projectId: input.projectId },
        select: { id: true, public: true, password: true },
      });

      if (!share) {
        return null;
      }

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),

  createOverview: protectedProcedure
    .input(zShareOverview)
    .mutation(async ({ input }) => {
      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;

      const share = await db.shareOverview.upsert({
        where: {
          projectId: input.projectId,
        },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          public: input.public,
          password: passwordHash,
        },
        update: {
          public: input.public,
          password: passwordHash,
        },
        select: { id: true, public: true, password: true },
      });

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),

  // Dashboard sharing
  dashboard: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const share = await db.shareDashboard.findUnique({
        where: { id: input.shareId },
        select: {
          id: true,
          public: true,
          password: true,
          organization: { select: { name: true } },
          project: { select: { name: true } },
          dashboard: { select: { name: true } },
        },
      });

      if (!share || !share.public) {
        throw new TRPCNotFoundError('Dashboard share not found');
      }

      const hasAccess = !!ctx.cookies[`shared-dashboard-${share.id}`];
      if (share.password && !hasAccess) {
        return lockedShare(share.id, share.organization, share.project);
      }

      return {
        id: share.id,
        requiresPassword: false as const,
        organization: share.organization,
        project: share.project,
        dashboard: share.dashboard,
      };
    }),

  dashboardSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), dashboardId: z.string() }))
    .query(async ({ input }) => {
      const share = await db.shareDashboard.findUnique({
        where: { dashboardId: input.dashboardId },
        select: { id: true, public: true, password: true, projectId: true },
      });

      if (!share || share.projectId !== input.projectId) {
        return null;
      }

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),

  createDashboard: protectedProcedure
    .input(zShareDashboard)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      const dashboard = await getDashboardById(
        input.dashboardId,
        input.projectId,
      );
      if (!dashboard) {
        throw new TRPCNotFoundError('Dashboard not found');
      }

      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;

      const share = await db.shareDashboard.upsert({
        where: {
          dashboardId: input.dashboardId,
        },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          dashboardId: input.dashboardId,
          public: input.public,
          password: passwordHash,
        },
        update: {
          public: input.public,
          password: passwordHash,
        },
        select: { id: true, public: true, password: true },
      });

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),

  dashboardReports: publicProcedure
    .input(
      z.object({
        shareId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const share = await getShareDashboardById(input.shareId);

      if (!share || !share.public) {
        throw new TRPCNotFoundError('Dashboard share not found');
      }

      // Check password access
      const hasAccess = !!ctx.cookies[`shared-dashboard-${share.id}`];
      if (share.password && !hasAccess) {
        throw new TRPCAccessError('Password required');
      }

      return getReportsByDashboardId(share.dashboardId);
    }),

  // Report sharing
  report: publicProcedure
    .input(z.object({ shareId: z.string() }))
    .query(async ({ input, ctx }) => {
      const share = await db.shareReport.findUnique({
        where: { id: input.shareId },
        select: {
          id: true,
          public: true,
          password: true,
          projectId: true,
          organization: { select: { name: true } },
          project: { select: { name: true } },
          report: true,
        },
      });

      if (!share || !share.public) {
        throw new TRPCNotFoundError('Report share not found');
      }

      const hasAccess = !!ctx.cookies[`shared-report-${share.id}`];
      if (share.password && !hasAccess) {
        return lockedShare(share.id, share.organization, share.project);
      }

      return {
        id: share.id,
        requiresPassword: false as const,
        organization: share.organization,
        project: share.project,
        projectId: share.projectId,
        report: transformReport(share.report),
      };
    }),

  reportSettings: protectedProcedure
    .input(z.object({ projectId: z.string(), reportId: z.string() }))
    .query(async ({ input }) => {
      const share = await db.shareReport.findUnique({
        where: { reportId: input.reportId },
        select: { id: true, public: true, password: true, projectId: true },
      });

      if (!share || share.projectId !== input.projectId) {
        return null;
      }

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),

  createReport: protectedProcedure
    .input(zShareReport)
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess({
        userId: ctx.session.userId,
        projectId: input.projectId,
        level: 'write',
      });

      const report = await getReportById(input.reportId);
      if (!report || report.projectId !== input.projectId) {
        throw new TRPCNotFoundError('Report not found');
      }

      const passwordHash = input.password
        ? await hashPassword(input.password)
        : null;

      const share = await db.shareReport.upsert({
        where: {
          reportId: input.reportId,
        },
        create: {
          id: uid.rnd(),
          organizationId: input.organizationId,
          projectId: input.projectId,
          reportId: input.reportId,
          public: input.public,
          password: passwordHash,
        },
        update: {
          public: input.public,
          password: passwordHash,
        },
        select: { id: true, public: true, password: true },
      });

      return {
        id: share.id,
        public: share.public,
        hasPassword: !!share.password,
      };
    }),
});
