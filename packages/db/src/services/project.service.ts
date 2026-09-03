// The project service lives in @openpanel/core now (M6-002). Re-exported
// here for existing `@openpanel/db` importers (this package's own
// access.service.ts + notification.service.ts, several core modules'
// `src/access.ts`, apps/api/src/utils/auth.ts) — same shape as
// packages/db/src/services/organization.service.ts since M6-001.
export type {
  IServiceProject,
  IServiceProjectWithClients,
} from '@openpanel/core';
export {
  getLastEventPerProject,
  getProjectById,
  getProjectByIdCached,
  getProjectEventsCount,
  getProjects,
  getProjectWithClients,
  listProjectsCore,
  resolveClientProjectId,
} from '@openpanel/core';
