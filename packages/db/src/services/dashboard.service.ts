// The dashboard service lives in @openpanel/core now (M7-006). Re-exported
// here for existing `@openpanel/db` importers (packages/trpc's dashboard/
// report routers, apps/api's insights controller, the mcp/assistant tools,
// packages/core's report.service and share.service) — same shape as
// packages/db/src/services/chart.service.ts since M7-003.
export type {
  IServiceDashboard,
  IServiceDashboards,
} from '@openpanel/core';
export {
  createDashboard,
  deleteDashboard,
  getDashboardById,
  getDashboardByIdOrThrow,
  getDashboardsByProjectId,
  listDashboardsCore,
  updateDashboard,
} from '@openpanel/core';
