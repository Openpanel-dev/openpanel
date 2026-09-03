// The share service — plus the query/mutation bodies
// packages/trpc/src/routers/share.ts held inline — lives in @openpanel/core
// now (M6-004). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's chart/overview routers, which still reach
// validateShareAccess/validateOverviewShareAccess through it) — same shape
// as packages/db/src/services/organization.service.ts since M6-001.
export {
  createShareDashboard,
  createShareOverview,
  createShareReport,
  getShareByProjectId,
  getShareDashboard,
  getShareDashboardById,
  getShareDashboardByDashboardId,
  getShareDashboardReports,
  getShareDashboardSettings,
  getShareOverview,
  getShareOverviewById,
  getShareOverviewSettings,
  getShareReport,
  getShareReportById,
  getShareReportByReportId,
  getShareReportSettings,
  validateOverviewShareAccess,
  validateReportAccess,
  validateShareAccess,
} from '@openpanel/core';
