// The sessions/profiles/events-table filter compiler lives in @openpanel/core
// now (M8-005): packages/core/src/modules/chart/src/table-filter-where.ts.
// Re-exported here for existing `@openpanel/db` importers — same shape as
// packages/db/src/services/chart.service.ts since M7-003.
export type { FilterTableContext } from '@openpanel/core';
export { buildFilterWhere } from '@openpanel/core';
