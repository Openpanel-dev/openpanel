// Moved into @openpanel/core's cohort module (M5-003, ADR-008's module map:
// cohort owns "C"). Re-exported here for existing @openpanel/validation
// importers (apps/start's cohort UI, packages/db/src/types.ts) — same shape
// as packages/db/src/gsc.ts since M5-002. The `./modules/cohort/cohort.constants`
// subpath is a leaf, isomorphic file with no back-imports into
// @openpanel/validation, so this re-export carries no runtime cycle despite
// @openpanel/core already depending on @openpanel/validation elsewhere.
export * from '@openpanel/core/modules/cohort/cohort.constants';
