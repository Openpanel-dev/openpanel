// The organization service — plus packages/db/src/services/delete.service.ts,
// folded in with it — lives in @openpanel/core now (M6-001). Re-exported here
// for existing `@openpanel/db` importers (packages/db's own engine +
// analytics services reading `getSettingsForProject`, packages/trpc's
// organization router, apps/worker's delete cron job) — same shape as
// packages/db/src/gsc.ts since M5-002.
export type {
  IServiceInvite,
  IServiceMember,
  IServiceOrganization,
  IServiceProjectAccess,
} from '@openpanel/core';
export {
  cancelOrganizationDeletion,
  connectUserToOrganization,
  deleteFromClickhouse,
  deleteOrganization,
  deleteProjects,
  getInviteById,
  getInvites,
  getMember,
  getMembers,
  getOrganizationBillingEventsCount,
  getOrganizationBillingEventsCountSerie,
  getOrganizationBillingEventsCountSerieCached,
  getOrganizationById,
  getOrganizationByProjectId,
  getOrganizationByProjectIdCached,
  getOrganizationEventsCount,
  getOrganizationEventsCountSince,
  getOrganizationSubscriptionChartEndDate,
  getOrganizations,
  getSettingsForOrganization,
  getSettingsForProject,
  inviteUserToOrganization,
  removeOrganizationMember,
  revokeInvite,
  runDeleteCron,
  scheduleOrganizationDeletion,
  updateOrganization,
  updateOrganizationMemberAccess,
} from '@openpanel/core';
