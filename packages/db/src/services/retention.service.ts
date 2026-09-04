// The retention service — the week-over-week series, the rolling active-user
// series, the last-seen distribution and the cohort matrix — lives in
// @openpanel/core now (M7-004). Re-exported here for existing `@openpanel/db`
// importers (the barrel, apps/api's insights controller, packages/core's mcp
// and assistant tools) — same shape as chart.service.ts since M7-003.
export type {
  IGetRetentionCohortInput,
  IRetentionCohortRow,
  IRetentionCriteria,
  IRetentionInterval,
  IServiceRetentionRollingActiveUsers,
} from '@openpanel/core';
export {
  getEngagementCore,
  getRetentionCohort,
  getRetentionCohortCore,
  getRetentionLastSeenSeries,
  getRetentionSeries,
  getRollingActiveUsers,
  getRollingActiveUsersCore,
  getWeeklyRetentionSeriesCore,
  processCohortData,
} from '@openpanel/core';
