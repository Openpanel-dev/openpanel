// P11 shim (ADR-008/ADR-007): definitions moved to packages/core/src/shared.
// Reached by relative path, not through @openpanel/core, so that bundling
// this package (packages/sdks/express sets noExternal) pulls the one leaf file
// and not core barrel. Deleted by M11-009.
export { generateId, shortId } from '../../core/src/shared/id';
