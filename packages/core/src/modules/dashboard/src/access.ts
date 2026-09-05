// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. Same shape as
// chart/src/access.ts and project/src/access.ts.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';
import { getProjectById } from '@openpanel/core';
import { createAccessChecks } from '../../../shared/access';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireProjectAccess = checks.requireProjectAccess;
