// Moved from packages/db/src/services/share.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/share.ts held inline
// (M6-004, DELEGATE PATTERN: V1's router and this package's own share.rpc.ts
// share one implementation, same as organization.service.ts since M6-001).
// packages/db keeps a re-export shim: auth.service.ts's signInToShare
// (M6-003) and packages/trpc's chart/overview routers still reach
// validateShareAccess/validateOverviewShareAccess through it.
//
// db access is LAZY, not a static top-level import — see insight.service.ts's
// header for the full reasoning (jobs.registry.ts and services.ts pull this
// module into the eager barrel chain nearly every core test file reaches, and
// constructing @openpanel/db's clients at import time would spawn a
// pino-pretty transport worker thread per test file).

import ShortUniqueId from 'short-unique-id';
import { TRPCAccessError, TRPCNotFoundError } from '../../rpc/errors';
import { hashPassword } from '../auth/auth.service';

const SHARE_ID_LENGTH = 6;
const uid = new ShortUniqueId({ length: SHARE_ID_LENGTH });

/** `HttpCtx.cookies`'s shape, named locally so this file has no import from
 *  the rpc/http layer that calls it — same as auth.service.ts's CookieReader. */
interface CookieReader {
  get(name: string): string | undefined;
}

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

function loadAccessService() {
  return import('@openpanel/db/src/services/access.service');
}

function loadDashboardService() {
  return import('@openpanel/db/src/services/dashboard.service');
}

function loadReportsService() {
  return import('@openpanel/db/src/services/reports.service');
}

// -----------------------------------------------------------------------
// Raw lookups (ported verbatim from packages/db/src/services/share.service.ts).

export async function getShareOverviewById(id: string) {
  const db = await loadDb();
  return db.shareOverview.findFirst({
    where: { id },
    include: { project: true },
  });
}

export async function getShareByProjectId(projectId: string) {
  const db = await loadDb();
  return db.shareOverview.findUnique({ where: { projectId } });
}

export async function getShareDashboardById(id: string) {
  const db = await loadDb();
  return db.shareDashboard.findFirst({
    where: { id },
    include: { dashboard: { include: { project: true } } },
  });
}

export async function getShareDashboardByDashboardId(dashboardId: string) {
  const db = await loadDb();
  return db.shareDashboard.findUnique({ where: { dashboardId } });
}

export async function getShareReportById(id: string) {
  const db = await loadDb();
  return db.shareReport.findFirst({
    where: { id },
    include: { report: { include: { project: true } } },
  });
}

export async function getShareReportByReportId(reportId: string) {
  const db = await loadDb();
  return db.shareReport.findUnique({ where: { reportId } });
}

/**
 * @deprecated Zero call sites (ADR-015 register entry #14, graded DEAD).
 * Ported as-is — removal is a separate P6/P7 task, not this one's.
 */
export async function validateReportAccess(
  reportId: string,
  shareId: string,
  shareType: 'dashboard' | 'report'
) {
  const db = await loadDb();

  if (shareType === 'dashboard') {
    const share = await db.shareDashboard.findUnique({
      where: { id: shareId },
      include: {
        dashboard: {
          include: {
            reports: { where: { id: reportId } },
          },
        },
      },
    });

    if (!share || !share.public) {
      throw new Error('Share not found or not public');
    }

    if (!share.dashboard.reports.some((r) => r.id === reportId)) {
      throw new Error('Report does not belong to this dashboard');
    }

    return share;
  }

  const share = await db.shareReport.findUnique({
    where: { id: shareId },
    include: { report: true },
  });

  if (!share || !share.public) {
    throw new Error('Share not found or not public');
  }

  if (share.reportId !== reportId) {
    throw new Error('Report ID mismatch');
  }

  return share;
}

export async function validateShareAccess(
  shareId: string,
  reportId: string,
  ctx: {
    cookies: CookieReader;
    session?: { userId?: string | null };
  }
): Promise<{ projectId: string; isValid: boolean }> {
  const db = await loadDb();
  const { getProjectAccess } = await loadAccessService();

  const dashboardShare = await db.shareDashboard.findUnique({
    where: { id: shareId },
    include: {
      dashboard: {
        include: {
          reports: { where: { id: reportId } },
        },
      },
    },
  });

  if (
    dashboardShare?.dashboard?.reports &&
    dashboardShare.dashboard.reports.length > 0
  ) {
    if (!dashboardShare.public) {
      throw new Error('Share not found or not public');
    }

    const projectId = dashboardShare.projectId;

    if (!dashboardShare.password) {
      return { projectId, isValid: true };
    }

    const hasCookie = !!ctx.cookies.get(`shared-dashboard-${shareId}`);
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({ userId: ctx.session.userId, projectId }));

    return { projectId, isValid: hasCookie || !!hasMemberAccess };
  }

  const reportShare = await db.shareReport.findUnique({
    where: { id: shareId, reportId },
    include: { report: true },
  });

  if (reportShare) {
    if (!reportShare.public) {
      throw new Error('Share not found or not public');
    }

    const projectId = reportShare.projectId;

    if (!reportShare.password) {
      return { projectId, isValid: true };
    }

    const hasCookie = !!ctx.cookies.get(`shared-report-${shareId}`);
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({ userId: ctx.session.userId, projectId }));

    return { projectId, isValid: hasCookie || !!hasMemberAccess };
  }

  throw new Error('Share not found');
}

export async function validateOverviewShareAccess(
  shareId: string | undefined,
  projectId: string,
  ctx: {
    cookies: CookieReader;
    session?: { userId?: string | null };
  }
): Promise<{ isValid: boolean }> {
  const db = await loadDb();
  const { getProjectAccess } = await loadAccessService();

  if (shareId) {
    const share = await db.shareOverview.findUnique({
      where: { id: shareId },
    });

    if (!share || !share.public) {
      throw new Error('Share not found or not public');
    }

    if (share.projectId !== projectId) {
      throw new Error('Project ID mismatch');
    }

    if (!share.password) {
      return { isValid: true };
    }

    const hasCookie = !!ctx.cookies.get(`shared-overview-${shareId}`);
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({ userId: ctx.session.userId, projectId }));

    return { isValid: hasCookie || !!hasMemberAccess };
  }

  if (!ctx.session?.userId) {
    throw new Error('Authentication required');
  }

  const access = await getProjectAccess({
    userId: ctx.session.userId,
    projectId,
  });

  if (!access) {
    throw new Error('You do not have access to this project');
  }

  return { isValid: true };
}

// -----------------------------------------------------------------------
// Router bodies (ported from packages/trpc/src/routers/share.ts).
//
// The `overview`/`dashboard`/`report` functions below are unauthenticated and
// serve the public viewer, addressed only by `shareId`. They project an
// explicit allow-list of columns and refuse to hand back any shared content
// until the `public` flag and the password cookie have both been checked.
// Returning the row and letting the client decide is what leaked the argon2
// password hash and private report definitions (GHSA-7gv7-c464-9wh8).
//
// The `*Settings`/`create*` functions are for the owner's share modal and
// never return the password hash either — only whether one is set.

/** Shape returned to a viewer who has not unlocked a password-protected share. */
function lockedShare(
  id: string,
  organization: { name: string },
  project: { name: string }
) {
  return {
    id,
    requiresPassword: true as const,
    organization,
    project,
  };
}

export async function getShareOverview(shareId: string, cookies: CookieReader) {
  const db = await loadDb();
  const share = await db.shareOverview.findUnique({
    where: { id: shareId },
    select: {
      id: true,
      public: true,
      password: true,
      projectId: true,
      organization: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  if (!(share && share.public)) {
    throw new TRPCNotFoundError('Share not found');
  }

  const hasAccess = !!cookies.get(`shared-overview-${share.id}`);
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
}

export async function getShareOverviewSettings(projectId: string) {
  const db = await loadDb();
  const share = await db.shareOverview.findUnique({
    where: { projectId },
    select: { id: true, public: true, password: true },
  });

  if (!share) {
    return null;
  }

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

export async function createShareOverview(input: {
  organizationId: string;
  projectId: string;
  public: boolean;
  password: string | null;
}) {
  const db = await loadDb();
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const share = await db.shareOverview.upsert({
    where: { projectId: input.projectId },
    create: {
      id: uid.rnd(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      public: input.public,
      password: passwordHash,
    },
    update: { public: input.public, password: passwordHash },
    select: { id: true, public: true, password: true },
  });

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

export async function getShareDashboard(shareId: string, cookies: CookieReader) {
  const db = await loadDb();
  const share = await db.shareDashboard.findUnique({
    where: { id: shareId },
    select: {
      id: true,
      public: true,
      password: true,
      organization: { select: { name: true } },
      project: { select: { name: true } },
      dashboard: { select: { name: true } },
    },
  });

  if (!(share && share.public)) {
    throw new TRPCNotFoundError('Dashboard share not found');
  }

  const hasAccess = !!cookies.get(`shared-dashboard-${share.id}`);
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
}

export async function getShareDashboardSettings(
  projectId: string,
  dashboardId: string
) {
  const db = await loadDb();
  const share = await db.shareDashboard.findUnique({
    where: { dashboardId },
    select: { id: true, public: true, password: true, projectId: true },
  });

  if (!share || share.projectId !== projectId) {
    return null;
  }

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

/** The caller must already have write access to `input.projectId` — the RPC
 *  layer's job (each transport still owns its own access-check plumbing). */
export async function createShareDashboard(input: {
  organizationId: string;
  projectId: string;
  dashboardId: string;
  public: boolean;
  password: string | null;
}) {
  const { getDashboardById } = await loadDashboardService();
  const dashboard = await getDashboardById(input.dashboardId, input.projectId);
  if (!dashboard) {
    throw new TRPCNotFoundError('Dashboard not found');
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const db = await loadDb();
  const share = await db.shareDashboard.upsert({
    where: { dashboardId: input.dashboardId },
    create: {
      id: uid.rnd(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      dashboardId: input.dashboardId,
      public: input.public,
      password: passwordHash,
    },
    update: { public: input.public, password: passwordHash },
    select: { id: true, public: true, password: true },
  });

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

export async function getShareDashboardReports(
  shareId: string,
  cookies: CookieReader
) {
  const share = await getShareDashboardById(shareId);

  if (!(share && share.public)) {
    throw new TRPCNotFoundError('Dashboard share not found');
  }

  const hasAccess = !!cookies.get(`shared-dashboard-${share.id}`);
  if (share.password && !hasAccess) {
    throw new TRPCAccessError('Password required');
  }

  const { getReportsByDashboardId } = await loadReportsService();
  return getReportsByDashboardId(share.dashboardId);
}

export async function getShareReport(shareId: string, cookies: CookieReader) {
  const db = await loadDb();
  const share = await db.shareReport.findUnique({
    where: { id: shareId },
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

  if (!(share && share.public)) {
    throw new TRPCNotFoundError('Report share not found');
  }

  const hasAccess = !!cookies.get(`shared-report-${share.id}`);
  if (share.password && !hasAccess) {
    return lockedShare(share.id, share.organization, share.project);
  }

  const { transformReport } = await loadReportsService();
  return {
    id: share.id,
    requiresPassword: false as const,
    organization: share.organization,
    project: share.project,
    projectId: share.projectId,
    report: transformReport(share.report),
  };
}

export async function getShareReportSettings(
  projectId: string,
  reportId: string
) {
  const db = await loadDb();
  const share = await db.shareReport.findUnique({
    where: { reportId },
    select: { id: true, public: true, password: true, projectId: true },
  });

  if (!share || share.projectId !== projectId) {
    return null;
  }

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

/** The caller must already have write access to `input.projectId` — the RPC
 *  layer's job (each transport still owns its own access-check plumbing). */
export async function createShareReport(input: {
  organizationId: string;
  projectId: string;
  reportId: string;
  public: boolean;
  password: string | null;
}) {
  const { getReportById } = await loadReportsService();
  const report = await getReportById(input.reportId);
  if (!report || report.projectId !== input.projectId) {
    throw new TRPCNotFoundError('Report not found');
  }

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const db = await loadDb();
  const share = await db.shareReport.upsert({
    where: { reportId: input.reportId },
    create: {
      id: uid.rnd(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      reportId: input.reportId,
      public: input.public,
      password: passwordHash,
    },
    update: { public: input.public, password: passwordHash },
    select: { id: true, public: true, password: true },
  });

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}
