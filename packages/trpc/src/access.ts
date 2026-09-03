// The permission ladder now lives in @openpanel/core (`shared/access`); this
// file binds it to the real `@openpanel/db` lookups and keeps the specifier
// V1's routers and `apps/api` already import.
//
// The ladder itself — the rules, the messages, GHSA-f9rx-pxgw-c6rg's fix — is
// core's and single-sourced there.

import { createAccessChecks } from '@openpanel/core';
import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
  getProjectById,
} from '@openpanel/db';

export {
  getClientAccess,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/db';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireProjectAccess = checks.requireProjectAccess;
export const requireOrganizationAdmin = checks.requireOrganizationAdmin;
export const requireProjectAdmin = checks.requireProjectAdmin;
