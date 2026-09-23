// Moved from packages/db/src/services/share.service.ts, plus the
// query/mutation bodies packages/trpc/src/routers/share.ts held inline
// (M6-004, DELEGATE PATTERN: V1's router and this package's own share.rpc.ts
// share one implementation, same as organization.service.ts since M6-001).
// packages/db keeps a re-export shim: auth.service.ts's signInToShare
// (M6-003) and packages/trpc's chart/overview routers still reach
// validateShareAccess/validateOverviewShareAccess through it.
//
// M10-003: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` / `loadAccessService()` / `loadDashboardService()`
// / `loadReportsService()` lazy loaders are gone, so this module
// value-imports neither `@openpanel/db` nor its own package barrel
// (docs/TECH_DEBT.md §4).

import ShortUniqueId from 'short-unique-id';
import { TRPCForbiddenError, TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import { getProjectAccess } from '../../shared/access-lookups';
import { hasShareAccess, type ShareType } from '../../shared/share-access';
import { hashPassword } from '../auth/auth.service';
import { getDashboardById } from '../dashboard/dashboard.service';
import {
  getReportById,
  getReportsByDashboardId,
  transformReport,
} from '../report/report.service';

const SHARE_ID_LENGTH = 6;
const uid = new ShortUniqueId({ length: SHARE_ID_LENGTH });

/** `HttpCtx.cookies`'s shape, named locally so this file has no import from
 *  the rpc/http layer that calls it — same as auth.service.ts's CookieReader. */
interface CookieReader {
  get(name: string): string | undefined;
}

// -----------------------------------------------------------------------
// Raw lookups (ported verbatim from packages/db/src/services/share.service.ts).

export async function getShareOverviewById(deps: ServiceDeps, id: string) {
  const db = deps.db;
  return db.shareOverview.findFirst({
    where: { id },
    include: { project: true },
  });
}

export async function getShareByProjectId(
  deps: ServiceDeps,
  projectId: string
) {
  const db = deps.db;
  return db.shareOverview.findUnique({ where: { projectId } });
}

export async function getShareDashboardById(deps: ServiceDeps, id: string) {
  const db = deps.db;
  return db.shareDashboard.findFirst({
    where: { id },
    include: { dashboard: { include: { project: true } } },
  });
}

export async function getShareDashboardByDashboardId(
  deps: ServiceDeps,
  dashboardId: string
) {
  const db = deps.db;
  return db.shareDashboard.findUnique({ where: { dashboardId } });
}

export async function getShareReportById(deps: ServiceDeps, id: string) {
  const db = deps.db;
  return db.shareReport.findFirst({
    where: { id },
    include: { report: { include: { project: true } } },
  });
}

export async function getShareReportByReportId(
  deps: ServiceDeps,
  reportId: string
) {
  const db = deps.db;
  return db.shareReport.findUnique({ where: { reportId } });
}

/**
 * @deprecated Zero call sites (ADR-015 register entry #14, graded DEAD).
 * Ported as-is — removal is a separate P6/P7 task, not this one's.
 */
export async function validateReportAccess(
  deps: ServiceDeps,
  reportId: string,
  shareId: string,
  shareType: 'dashboard' | 'report'
) {
  const db = deps.db;

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

    if (!(share && share.public)) {
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

  if (!(share && share.public)) {
    throw new Error('Share not found or not public');
  }

  if (share.reportId !== reportId) {
    throw new Error('Report ID mismatch');
  }

  return share;
}

export async function validateShareAccess(
  deps: ServiceDeps,
  shareId: string,
  reportId: string,
  ctx: {
    cookies: CookieReader;
    session?: { userId?: string | null };
  }
): Promise<{ projectId: string; isValid: boolean }> {
  const db = deps.db;

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

    const hasCookie = hasShareAccess(deps.config.cookies.secret, ctx.cookies, {
      type: 'dashboard',
      id: shareId,
      passwordHash: dashboardShare.password,
    });
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

    const hasCookie = hasShareAccess(deps.config.cookies.secret, ctx.cookies, {
      type: 'report',
      id: shareId,
      passwordHash: reportShare.password,
    });
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({ userId: ctx.session.userId, projectId }));

    return { projectId, isValid: hasCookie || !!hasMemberAccess };
  }

  throw new Error('Share not found');
}

export async function validateOverviewShareAccess(
  deps: ServiceDeps,
  shareId: string | undefined,
  projectId: string,
  ctx: {
    cookies: CookieReader;
    session?: { userId?: string | null };
  }
): Promise<{ isValid: boolean }> {
  const db = deps.db;

  if (shareId) {
    const share = await db.shareOverview.findUnique({
      where: { id: shareId },
    });

    if (!(share && share.public)) {
      throw new Error('Share not found or not public');
    }

    if (share.projectId !== projectId) {
      throw new Error('Project ID mismatch');
    }

    if (!share.password) {
      return { isValid: true };
    }

    const hasCookie = hasShareAccess(deps.config.cookies.secret, ctx.cookies, {
      type: 'overview',
      id: shareId,
      passwordHash: share.password,
    });
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

/** The share rows these readers hold: an id and the stored password hash. */
function isUnlocked(
  deps: ServiceDeps,
  cookies: CookieReader,
  type: ShareType,
  share: { id: string; password: string | null }
): boolean {
  if (!share.password) {
    return true;
  }
  return hasShareAccess(deps.config.cookies.secret, cookies, {
    type,
    id: share.id,
    passwordHash: share.password,
  });
}

/**
 * Whether an anonymous viewer may read project-scoped side data — chart
 * annotations today — for a project.
 *
 * Allowed only when the project has a share of one of `kinds` that is public
 * and, if password-protected, unlocked with a verified cookie. A share row
 * merely existing is not enough: a share is switched off by setting
 * `public: false` and the row stays, and a password share must not leak
 * through a side endpoint the share page itself would refuse.
 */
export async function hasAnonymousShareAccessToProject(
  deps: ServiceDeps,
  projectId: string,
  cookies: CookieReader,
  kinds: ShareType[] = ['overview', 'dashboard', 'report']
): Promise<boolean> {
  const db = deps.db;
  const select = { id: true, password: true } as const;
  const where = { projectId, public: true } as const;

  const [overviews, dashboards, reports] = await Promise.all([
    kinds.includes('overview')
      ? db.shareOverview.findMany({ where, select })
      : [],
    kinds.includes('dashboard')
      ? db.shareDashboard.findMany({ where, select })
      : [],
    kinds.includes('report') ? db.shareReport.findMany({ where, select }) : [],
  ]);

  return (
    overviews.some((share) => isUnlocked(deps, cookies, 'overview', share)) ||
    dashboards.some((share) => isUnlocked(deps, cookies, 'dashboard', share)) ||
    reports.some((share) => isUnlocked(deps, cookies, 'report', share))
  );
}

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

export async function getShareOverview(
  deps: ServiceDeps,
  shareId: string,
  cookies: CookieReader
) {
  const db = deps.db;
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

  if (share.password && !isUnlocked(deps, cookies, 'overview', share)) {
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

export async function getShareOverviewSettings(
  deps: ServiceDeps,
  projectId: string
) {
  const db = deps.db;
  const share = await db.shareOverview.findUnique({
    where: { projectId },
    select: { id: true, public: true, password: true },
  });

  if (!share) {
    return null;
  }

  return { id: share.id, public: share.public, hasPassword: !!share.password };
}

export interface CreateShareOverviewInput {
  organizationId: string;
  projectId: string;
  public: boolean;
  password: string | null;
}

export async function createShareOverview(
  deps: ServiceDeps,
  input: CreateShareOverviewInput
) {
  const db = deps.db;
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

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

export async function getShareDashboard(
  deps: ServiceDeps,
  shareId: string,
  cookies: CookieReader
) {
  const db = deps.db;
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

  if (share.password && !isUnlocked(deps, cookies, 'dashboard', share)) {
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
  deps: ServiceDeps,
  projectId: string,
  dashboardId: string
) {
  const db = deps.db;
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
export interface CreateShareDashboardInput {
  organizationId: string;
  projectId: string;
  dashboardId: string;
  public: boolean;
  password: string | null;
}

export async function createShareDashboard(
  deps: ServiceDeps,
  input: CreateShareDashboardInput
) {
  const dashboard = await getDashboardById(
    deps,
    input.dashboardId,
    input.projectId
  );
  if (!dashboard) {
    throw new TRPCNotFoundError('Dashboard not found');
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

  const db = deps.db;
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

/** Assumes `getShareDashboard` already ran and reported `requiresPassword:
 *  false` — throws instead of returning `lockedShare` because a caller that
 *  reaches here without unlocking first has no locked-viewer UI to show. */
export async function getShareDashboardReports(
  deps: ServiceDeps,
  shareId: string,
  cookies: CookieReader
) {
  const share = await getShareDashboardById(deps, shareId);

  if (!(share && share.public)) {
    throw new TRPCNotFoundError('Dashboard share not found');
  }

  // FORBIDDEN, not UNAUTHORIZED: the dashboard treats a 401 as "session
  // gone" and hard-navigates to /login, which made every password-protected
  // share unusable. A locked share is an authorization refusal, like the
  // share guards in overview.rpc.ts and chart.rpc.ts.
  if (share.password && !isUnlocked(deps, cookies, 'dashboard', share)) {
    throw new TRPCForbiddenError('Password required');
  }

  return getReportsByDashboardId(deps, share.dashboardId);
}

export async function getShareReport(
  deps: ServiceDeps,
  shareId: string,
  cookies: CookieReader
) {
  const db = deps.db;
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

  if (share.password && !isUnlocked(deps, cookies, 'report', share)) {
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
}

export async function getShareReportSettings(
  deps: ServiceDeps,
  projectId: string,
  reportId: string
) {
  const db = deps.db;
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
export interface CreateShareReportInput {
  organizationId: string;
  projectId: string;
  reportId: string;
  public: boolean;
  password: string | null;
}

export async function createShareReport(
  deps: ServiceDeps,
  input: CreateShareReportInput
) {
  const report = await getReportById(deps, input.reportId);
  if (!report || report.projectId !== input.projectId) {
    throw new TRPCNotFoundError('Report not found');
  }

  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;

  const db = deps.db;
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

// --- service ------------------------------------------------------------

/** What the RPC layer passes to the two share validators. */
export interface ShareAccessContext {
  cookies: CookieReader;
  session?: { userId?: string | null };
}

export function createShareService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getShareOverviewById: (
      id: string
    ): ReturnType<typeof getShareOverviewById> =>
      getShareOverviewById(deps, id),
    getShareByProjectId: (
      projectId: string
    ): ReturnType<typeof getShareByProjectId> =>
      getShareByProjectId(deps, projectId),
    getShareDashboardById: (
      id: string
    ): ReturnType<typeof getShareDashboardById> =>
      getShareDashboardById(deps, id),
    getShareDashboardByDashboardId: (
      dashboardId: string
    ): ReturnType<typeof getShareDashboardByDashboardId> =>
      getShareDashboardByDashboardId(deps, dashboardId),
    getShareReportById: (id: string): ReturnType<typeof getShareReportById> =>
      getShareReportById(deps, id),
    getShareReportByReportId: (
      reportId: string
    ): ReturnType<typeof getShareReportByReportId> =>
      getShareReportByReportId(deps, reportId),
    validateReportAccess: (
      reportId: string,
      shareId: string,
      shareType: 'dashboard' | 'report'
    ): ReturnType<typeof validateReportAccess> =>
      validateReportAccess(deps, reportId, shareId, shareType),
    validateShareAccess: (
      shareId: string,
      reportId: string,
      accessContext: ShareAccessContext
    ): Promise<{ projectId: string; isValid: boolean }> =>
      validateShareAccess(deps, shareId, reportId, accessContext),
    validateOverviewShareAccess: (
      shareId: string | undefined,
      projectId: string,
      accessContext: ShareAccessContext
    ): Promise<{ isValid: boolean }> =>
      validateOverviewShareAccess(deps, shareId, projectId, accessContext),
    hasAnonymousShareAccessToProject: (
      projectId: string,
      cookies: CookieReader,
      kinds?: ShareType[]
    ): Promise<boolean> =>
      hasAnonymousShareAccessToProject(deps, projectId, cookies, kinds),
    getShareOverview: (
      shareId: string,
      cookies: CookieReader
    ): ReturnType<typeof getShareOverview> =>
      getShareOverview(deps, shareId, cookies),
    getShareOverviewSettings: (
      projectId: string
    ): ReturnType<typeof getShareOverviewSettings> =>
      getShareOverviewSettings(deps, projectId),
    createShareOverview: (
      input: CreateShareOverviewInput
    ): ReturnType<typeof createShareOverview> =>
      createShareOverview(deps, input),
    getShareDashboard: (
      shareId: string,
      cookies: CookieReader
    ): ReturnType<typeof getShareDashboard> =>
      getShareDashboard(deps, shareId, cookies),
    getShareDashboardSettings: (
      projectId: string,
      dashboardId: string
    ): ReturnType<typeof getShareDashboardSettings> =>
      getShareDashboardSettings(deps, projectId, dashboardId),
    createShareDashboard: (
      input: CreateShareDashboardInput
    ): ReturnType<typeof createShareDashboard> =>
      createShareDashboard(deps, input),
    getShareDashboardReports: (
      shareId: string,
      cookies: CookieReader
    ): ReturnType<typeof getShareDashboardReports> =>
      getShareDashboardReports(deps, shareId, cookies),
    getShareReport: (
      shareId: string,
      cookies: CookieReader
    ): ReturnType<typeof getShareReport> =>
      getShareReport(deps, shareId, cookies),
    getShareReportSettings: (
      projectId: string,
      reportId: string
    ): ReturnType<typeof getShareReportSettings> =>
      getShareReportSettings(deps, projectId, reportId),
    createShareReport: (
      input: CreateShareReportInput
    ): ReturnType<typeof createShareReport> => createShareReport(deps, input),
  };
}
