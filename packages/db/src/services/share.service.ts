import { db } from '../prisma-client';

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
  } else {
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
}
