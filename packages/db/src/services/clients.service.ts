// The client service lives in @openpanel/core now (M6-002). Re-exported
// here for existing `@openpanel/db` importers (apps/api/src/utils/auth.ts,
// core's mcp module) — same shape as
// packages/db/src/services/organization.service.ts since M6-001.
export type {
  IServiceClient,
  IServiceClientWithProject,
} from '@openpanel/core';
export {
  getClientById,
  getClientByIdCached,
  getClientsByOrganizationId,
} from '@openpanel/core';
