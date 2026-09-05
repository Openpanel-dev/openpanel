// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. Same shape as
// organization/src/access.ts and gsc/src/access.ts. `getProjectById` is
// this module's own (../project.service), not the @openpanel/db deep path
// other modules bind through.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';
import { createAccessChecks } from '../../../shared/access';
import { getProjectById } from '../project.service';

export {
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
export const requireProjectAdmin = checks.requireProjectAdmin;
