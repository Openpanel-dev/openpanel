// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. Same shape as
// ../../notification/src/access.ts (M6-005) / ../../integration/src/access.ts
// (M6-006).

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/db/src/services/access.service';
import { getProjectById } from '@openpanel/db/src/services/project.service';
import { createAccessChecks } from '../../../shared/access';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireOrganizationAdmin = checks.requireOrganizationAdmin;
