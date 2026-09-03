// The GSC OAuth token lifecycle, the Search Console API client and its
// ClickHouse read/write live in @openpanel/core now (M5-002). Re-exported
// here for existing `@openpanel/db` importers (packages/mcp's gsc tools) —
// same shape as packages/db/src/encryption.ts since M4-006.
export type { GscCannibalizedQuery, GscSite } from '@openpanel/core';
export {
  getGscCannibalization,
  getGscOverview,
  getGscPageDetails,
  getGscPages,
  getGscQueries,
  getGscQueryDetails,
  listGscSites,
  syncGscData,
} from '@openpanel/core';
