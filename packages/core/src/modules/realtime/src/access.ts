// Binds core's shared/access.ts ladder to @openpanel/db's real lookups, for
// this module's own router — the same binding packages/trpc/src/access.ts
// does for V1, self-contained here because the general core -> db binding
// itself moves with auth (P6), not this wave. Same shape as
// organization/src/access.ts.
//
// The `/live` ws routes (realtime.routes.ts) want the RAW nullable lookups,
// not the throwing `require*` wrappers: V1's controller (still live,
// untouched) checks truthiness itself and sends a "No access" frame before
// closing the socket, rather than throwing — porting that behaviour means
// re-exporting `getProjectAccess`/`getOrganizationAccess` verbatim.

import {
  canWriteProject,
  getOrganizationAccess,
  getProjectAccess,
} from '@openpanel/core';
import { getProjectById } from '@openpanel/core';
import { createAccessChecks } from '../../../shared/access';

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
