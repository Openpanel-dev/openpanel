// The report service — transforms, mutations, listReportsCore and
// getReportDataCore — lives in @openpanel/core now (M7-006). Re-exported here
// for existing `@openpanel/db` importers (packages/trpc's report/chart
// routers, apps/api's insights controller, the chart engine's funnel/
// conversion services, the mcp/assistant tools) — same shape as
// packages/db/src/services/chart.service.ts since M7-003.
export type { IServiceReport } from '@openpanel/core';
export {
  createReport,
  deleteReport,
  duplicateReport,
  getReportById,
  getReportByIdOrThrow,
  getReportDataCore,
  getReportLayouts,
  getReportsByDashboardId,
  listReportsCore,
  mergeGlobalFilters,
  moveReport,
  onlyReportEvents,
  resetReportLayouts,
  transformFilter,
  transformReport,
  transformReportEventItem,
  updateReport,
  updateReportLayout,
} from '@openpanel/core';
