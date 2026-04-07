export { createMcpServer } from './src/server';
export { SessionManager } from './src/session-manager';
export { authenticateToken, McpAuthError } from './src/auth';
export { handleMcpGet, handleMcpPost } from './src/handler';
export type { McpAuthContext } from './src/auth';

// Core analytics functions — callable directly without MCP transport
export { resolveDateRange } from './src/tools/shared';
export { listProjectsCore } from './src/tools/projects';
export {
  getAnalyticsOverviewCore,
  type GetAnalyticsOverviewInput,
} from './src/tools/analytics/overview';
export {
  getFunnelCore,
} from './src/tools/analytics/funnel';
export {
  getTopPagesCore,
  getEntryExitPagesCore,
} from './src/tools/analytics/pages';
export {
  getRollingActiveUsersCore,
  getWeeklyRetentionSeriesCore,
} from './src/tools/analytics/active-users';
export { getRetentionCohortCore } from './src/tools/analytics/retention';
export {
  getTrafficBreakdownCore,
  type TrafficColumn,
} from './src/tools/analytics/traffic';
export { getUserFlowCore } from './src/tools/analytics/user-flow';
export { getEngagementCore } from './src/tools/analytics/engagement';
export { getPagePerformanceCore } from './src/tools/analytics/page-performance';
export {
  queryEventsCore,
  type QueryEventsInput,
} from './src/tools/analytics/events';
export {
  listEventNamesCore,
} from './src/tools/analytics/event-names';
export {
  listEventPropertiesCore,
  getEventPropertyValuesCore,
} from './src/tools/analytics/property-values';
export {
  findProfilesCore,
  getProfileWithEvents,
  getProfileSessionsCore,
  type FindProfilesInput,
} from './src/tools/analytics/profiles';
export {
  getProfileMetricsCore,
} from './src/tools/analytics/profile-metrics';
export {
  querySessionsCore,
  type QuerySessionsInput,
} from './src/tools/analytics/sessions';
export {
  listGroupTypesCore,
  findGroupsCore,
  getGroupCore,
} from './src/tools/analytics/groups';
export {
  listDashboardsCore,
  listReportsCore,
  getReportDataCore,
} from './src/tools/analytics/reports';
export { gscGetOverviewCore } from './src/tools/gsc/overview';
export { gscGetTopPagesCore, gscGetPageDetailsCore } from './src/tools/gsc/pages';
export {
  gscGetTopQueriesCore,
  gscGetQueryOpportunitiesCore,
  gscGetQueryDetailsCore,
} from './src/tools/gsc/queries';
export { gscGetCannibalizationCore } from './src/tools/gsc/cannibalization';
