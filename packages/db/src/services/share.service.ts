import { db } from '../prisma-client';
import { getProjectAccess } from './access.service';

export function getShareOverviewById(id: string) {
  return db.shareOverview.findFirst({
    where: {
      id,
    },
    include: {
      project: true,
    },
  });
}

export function getShareByProjectId(projectId: string) {
  return db.shareOverview.findUnique({
    where: {
      projectId,
    },
  });
}

// Dashboard sharing functions
export function getShareDashboardById(id: string) {
  return db.shareDashboard.findFirst({
    where: {
      id,
    },
    include: {
      dashboard: {
        include: {
          project: true,
        },
      },
    },
  });
}

export function getShareDashboardByDashboardId(dashboardId: string) {
  return db.shareDashboard.findUnique({
    where: {
      dashboardId,
    },
  });
}

// Report sharing functions
export function getShareReportById(id: string) {
  return db.shareReport.findFirst({
    where: {
      id,
    },
    include: {
      report: {
        include: {
          project: true,
        },
      },
    },
  });
}

export function getShareReportByReportId(reportId: string) {
  return db.shareReport.findUnique({
    where: {
      reportId,
    },
  });
}

// Validation for secure endpoints
export async function validateReportAccess(
  reportId: string,
  shareId: string,
  shareType: 'dashboard' | 'report',
) {
  if (shareType === 'dashboard') {
    const share = await db.shareDashboard.findUnique({
      where: { id: shareId },
      include: {
        dashboard: {
          include: {
            reports: {
              where: { id: reportId },
            },
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
    include: {
      report: true,
    },
  });

  if (!share || !share.public) {
    throw new Error('Share not found or not public');
  }

  if (share.reportId !== reportId) {
    throw new Error('Report ID mismatch');
  }

  return share;
}

// Unified validation for share access
export async function validateShareAccess(
  shareId: string,
  reportId: string,
  ctx: {
    cookies: Record<string, string | undefined>;
    session?: { userId?: string | null };
  },
): Promise<{ projectId: string; isValid: boolean }> {
  // Check ShareDashboard first
  const dashboardShare = await db.shareDashboard.findUnique({
    where: { id: shareId },
    include: {
      dashboard: {
        include: {
          reports: {
            where: { id: reportId },
          },
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

    // If no password is set, share is public and accessible
    if (!dashboardShare.password) {
      return {
        projectId,
        isValid: true,
      };
    }

    // If password is set, require cookie OR member access
    const hasCookie = !!ctx.cookies[`shared-dashboard-${shareId}`];
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      }));

    return {
      projectId,
      isValid: hasCookie || !!hasMemberAccess,
    };
  }

  // Check ShareReport
  const reportShare = await db.shareReport.findUnique({
    where: { id: shareId, reportId },
    include: {
      report: true,
    },
  });

  if (reportShare) {
    if (!reportShare.public) {
      throw new Error('Share not found or not public');
    }

    const projectId = reportShare.projectId;

    // If no password is set, share is public and accessible
    if (!reportShare.password) {
      return {
        projectId,
        isValid: true,
      };
    }

    // If password is set, require cookie OR member access
    const hasCookie = !!ctx.cookies[`shared-report-${shareId}`];
    const hasMemberAccess =
      ctx.session?.userId &&
      (await getProjectAccess({
        userId: ctx.session.userId,
        projectId,
      }));

    return {
      projectId,
      isValid: hasCookie || !!hasMemberAccess,
    };
  }

  throw new Error('Share not found');
}
