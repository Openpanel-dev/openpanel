// The concrete project/organization/client access lookups live in
// @openpanel/core now (M8-005): packages/core/src/shared/access-lookups.ts.
// Re-exported here for existing `@openpanel/db` importers (packages/trpc's
// access.ts, apps/api's app.ts + live.controller.ts, and the ~28 core
// modules' own `src/access.ts` files that deep-import this exact specifier)
// — same shape as event.service.ts since M7-002.
export {
  canWriteProject,
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
  type IProjectAccess,
} from '@openpanel/core';
