// Moved into @openpanel/core's assistant module (M5-005, ADR-008's module
// map: assistant owns "C"). Re-exported here for existing
// @openpanel/validation importers (apps/start's model picker + chat panel) —
// same shape as packages/validation/src/import.validation.ts since M5-004.
// The `./modules/assistant/assistant.constants` subpath is a leaf, isomorphic
// file with no back-imports into @openpanel/validation, so this re-export
// carries no runtime cycle despite @openpanel/core already depending on
// @openpanel/validation elsewhere.
export * from '@openpanel/core/modules/assistant/assistant.constants';
