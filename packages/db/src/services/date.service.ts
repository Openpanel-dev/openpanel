// Chart date-range resolution lives in @openpanel/core now (M8-005):
// packages/core/src/shared/date.ts. Re-exported here for existing
// `@openpanel/db` importers (packages/trpc's overview/event routers,
// apps/api's insights controller, ~40 core modules that still deep-import
// this exact specifier) — same shape as event.service.ts since M7-002.
export {
  getChartPrevStartEndDate,
  getChartStartEndDate,
  getDatesFromRange,
  resolveDateRange,
} from '@openpanel/core';
