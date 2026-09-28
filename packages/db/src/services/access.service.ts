// The concrete project/organization/client access lookups live in
// @openpanel/core now: packages/core/src/shared/access-lookups.ts.
//
// Kept here as a deep-path-only re-export (NOT part of packages/db's index.ts
// barrel — that shrank to the final surface at M9-CLEANUP-001) solely because
// the controller's protected `verification/contracts/auth/
// group-b-project-access.mts` hard-imports this exact path
// ('packages/db/src/services/access.service.ts') to exercise ADR-011 benchmark
// 2's getProjectAccess golden table. Every real importer in this repo now
// reaches these functions through `@openpanel/core` directly.
export {
  canWriteProject,
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
  type IProjectAccess,
} from '@openpanel/core';
