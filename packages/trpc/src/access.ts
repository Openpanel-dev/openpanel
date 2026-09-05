// The permission ladder now lives in @openpanel/core (`shared/access`); this
// file binds it to the real lookups (also core, since M9-CLEANUP-001) and
// keeps the specifier V1's routers and `apps/api` already import.
//
// The ladder itself — the rules, the messages, GHSA-f9rx-pxgw-c6rg's fix — is
// core's and single-sourced there.

import {
  canWriteProject,
  createAccessChecks,
  getOrganizationAccess,
  getProjectAccess,
  getProjectById,
} from '@openpanel/core';

export {
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireProjectAccess = checks.requireProjectAccess;
export const requireOrganizationAdmin = checks.requireOrganizationAdmin;
export const requireProjectAdmin = checks.requireProjectAdmin;
