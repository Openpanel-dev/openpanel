// Moved into @openpanel/core's import module (M5-004, ADR-008's module map:
// import owns "C"). Re-exported here for existing @openpanel/validation
// importers (apps/start's import UI, packages/db/src/types.ts) — same shape
// as packages/validation/src/cohort.validation.ts since M5-003. The
// `./modules/import/import.constants` subpath is a leaf, isomorphic file
// with no back-imports into @openpanel/validation, so this re-export carries
// no runtime cycle despite @openpanel/core already depending on
// @openpanel/validation elsewhere.
export * from '@openpanel/core/modules/import/import.constants';
