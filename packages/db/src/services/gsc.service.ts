// The AI-tool wrapper functions live in @openpanel/core now (M5-002).
// Re-exported here for existing `@openpanel/db` importers (the assistant's
// SEO tools, the /insights REST controller) — same shape as
// packages/db/src/encryption.ts since M4-006.
export type { GscQueryOpportunity } from '@openpanel/core';
export {
  gscGetCannibalizationCore,
  gscGetOverviewCore,
  gscGetPageDetailsCore,
  gscGetQueryDetailsCore,
  gscGetQueryOpportunitiesCore,
  gscGetTopPagesCore,
  gscGetTopQueriesCore,
} from '@openpanel/core';
