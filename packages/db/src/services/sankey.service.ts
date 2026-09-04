// The sankey (user-flow) service lives in @openpanel/core now (M7-004).
// Re-exported here for existing `@openpanel/db` importers (the barrel,
// apps/api's insights controller, packages/core's mcp and assistant tools).
export type { IGetSankeyInput } from '@openpanel/core';
export {
  getRawWhereClause,
  getSankey,
  getUserFlowCore,
  zGetSankeyInput,
} from '@openpanel/core';
