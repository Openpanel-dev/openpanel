// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. Same shape as
// conversation/src/access.ts and gsc/src/access.ts.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/db/src/services/access.service';
import { getProjectById } from '@openpanel/db/src/services/project.service';
import { createAccessChecks } from '../../../shared/access';

export { getOrganizationAccess } from '@openpanel/db/src/services/access.service';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireOrganizationAdmin = checks.requireOrganizationAdmin;
