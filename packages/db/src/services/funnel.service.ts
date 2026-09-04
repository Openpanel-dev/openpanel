// The funnel service lives in @openpanel/core now (M7-004). Re-exported here
// for existing `@openpanel/db` importers (the barrel, reports.service's
// `getReportDataCore`, apps/api's insights controller, packages/core's mcp and
// assistant tools).
export {
  buildFunnelBase,
  buildSessionsCte,
  EMPTY_BREAKDOWN_LABEL,
  getFunnel,
  getFunnelCore,
  getFunnelGroup,
  getFunnelProfileIds,
  toSeries as toFunnelSeries,
} from '@openpanel/core';
