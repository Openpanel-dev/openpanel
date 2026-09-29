// The concrete project/organization/client access lookups live in
// @openpanel/core now: packages/core/src/shared/access-lookups.ts.
//
// Kept here as a deep-path-only re-export (not part of packages/db's index.ts
// barrel) because this exact path is still imported directly, with no app
// boot at all. Every real importer in this repo now reaches these functions
// through `@openpanel/core` directly.
export {
  canWriteProject,
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
  type IProjectAccess,
} from '@openpanel/core';
