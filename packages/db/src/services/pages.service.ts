// Pages — PagesService and the mcp/insights "*Core" helpers — lives in
// @openpanel/core's overview module now (M7-005, the module map's owner of
// "pages"). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's event router, apps/api's insights controller, the mcp
// analytics tools) — same shape as
// packages/db/src/services/overview.service.ts since M7-003.
export type {
  IGetPagesInput,
  IPageConversionRow,
  IPageTimeseriesRow,
  ITopPage,
} from '@openpanel/core';
export {
  getEntryExitPagesCore,
  getPageConversionsCore,
  getPagePerformanceCore,
  getTopPagesCore,
  PagesService,
  pagesService,
} from '@openpanel/core';
