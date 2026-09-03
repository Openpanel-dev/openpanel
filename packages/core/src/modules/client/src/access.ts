// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. `getClientAccess` has no
// ladder wrapper (V1's packages/trpc/src/access.ts re-exports it bare too),
// only `requireOrganizationAdmin` goes through `createAccessChecks`.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/db/src/services/access.service';
import { createAccessChecks } from '../../../shared/access';
import { getProjectById } from '../../project/project.service';

export { getClientAccess } from '@openpanel/db/src/services/access.service';

const checks = createAccessChecks({
  getProjectAccess,
  canWriteProject,
  getOrganizationAccess,
  getProjectById,
});

export const requireOrganizationAdmin = checks.requireOrganizationAdmin;
