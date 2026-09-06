// P11 shim (ADR-008/ADR-007). The definitions live in
// packages/core/src/shared/json.ts. Reached by relative path, not through
// @openpanel/core: packages/redis calls these at runtime and core depends on
// packages/redis, so the barrel would invert that edge and drag core's whole
// import graph into the redis (and published-SDK) module graph.
// Deleted by M11-009 once M11-007/M11-008 retarget the last importer.
export {
  getSafeJson,
  getSuperJson,
  setSuperJson,
} from '../core/src/shared/json';
