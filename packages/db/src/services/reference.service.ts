// The reference service — plus the query/mutation bodies
// packages/trpc/src/routers/reference.ts held inline — lives in
// @openpanel/core now (M6-004). Re-exported here for existing
// `@openpanel/db` importers — same shape as
// packages/db/src/services/organization.service.ts since M6-001.
export type { IServiceReference } from '@openpanel/core';
export {
  createReference,
  deleteReference,
  getChartReferences,
  getReferenceById,
  getReferenceByIdOrThrow,
  listReferences,
  updateReference,
} from '@openpanel/core';
