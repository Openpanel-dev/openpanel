// The group service lives in @openpanel/core now (M7-002):
// packages/core/src/modules/group/group.service.ts, with every ClickHouse
// query rewritten onto the `sql` tag (packages/core/src/modules/group/src/
// group.sql.ts). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's group router, the assistant/mcp tools) — same shape as
// session.service.ts since M7-001.
export {
  createGroup,
  deleteGroup,
  findGroupsCore,
  getGroupById,
  getGroupCore,
  getGroupList,
  getGroupListCount,
  getGroupMemberProfiles,
  getGroupPropertyKeys,
  getGroupStats,
  getGroupsByIds,
  getGroupTypes,
  type IServiceGroup,
  type IServiceGroupStats,
  type IServiceUpsertGroup,
  listGroupTypesCore,
  updateGroup,
  upsertGroup,
} from '@openpanel/core';
