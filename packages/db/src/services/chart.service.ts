// The chart service — field resolution, the event filter compiler, the chart
// statements and the engine — lives in @openpanel/core now (M7-003).
// Re-exported here for existing `@openpanel/db` importers (packages/trpc's
// chart router, funnel/conversion/sankey/retention/overview services) — same
// shape as packages/db/src/services/organization.service.ts since M6-001.
export type {
  AggregateChartSqlInput,
  ChartSqlInput,
  CohortMetadata,
  FilterTableScope,
} from '@openpanel/core';
export {
  buildAllCohortsLabelExpr,
  buildAllCohortsMembershipQuery,
  buildCohortMembershipQuery,
  buildInlineCohortJoin,
  collectBreakdownCohortIds,
  collectProfilePropertyKeys,
  extractCohortId,
  fetchCohortsMetadata,
  fetchProjectCohorts,
  getAggregateChartSql,
  getChartSql,
  getCohortAlias,
  getCohortCteName,
  getEventFiltersWhereClause,
  getGroupPropertySelect,
  getGroupPropertySql,
  getProfilePropertySelect,
  getSelectPropertyKey,
  isAllCohortsBreakdown,
  isKnownEventField,
  normalizeEventField,
  profilePropertiesCteSelect,
  rewriteProfilePropertyRefs,
  transformPropertyKey,
} from '@openpanel/core';
