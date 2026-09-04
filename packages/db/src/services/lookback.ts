// The lookback ceiling lives in @openpanel/core now (M8-005):
// packages/core/src/shared/lookback.ts. Re-exported here for existing
// `@openpanel/db` importers (core's event/session services, which
// dynamic-import this exact specifier to keep one dynamic edge per import
// cycle) — same shape as event.service.ts since M7-002.
export { resolveMaxLookbackDays } from '@openpanel/core';
