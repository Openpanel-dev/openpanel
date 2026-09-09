// The isomorphic entrypoint of @openpanel/shared (ADR-022 R21).
//
// What may live behind this file: pure functions and types with no workspace
// import, no db/redis/env/logger/services and no domain vocabulary. Anything
// that needs one of those stays in the package that owns it.
//
// Nothing reachable from here may import a `node:*` builtin or `./server` —
// this is a browser bundle's entrypoint too, and the leak would be invisible
// at the call site. The `shared-root-stays-isomorphic` cruiser rule is what
// enforces it.
export {
  DateTime,
  getChartPrevStartEndDate,
  getTime,
  resolveDateRange,
} from './date';
export { generateId, generateSecureId, shortId } from './id';
export { getSafeJson, getSuperJson, setSuperJson } from './json';
export { average, ifNaN, max, min, round, sum } from './math';
export { deepMergeObjects, strip, toDots, toObject } from './object';
export { slug } from './slug';
export {
  stripLeadingAndTrailingSlashes,
  stripTrailingSlash,
} from './string';
export { type TryCatchResult, tryCatch } from './try-catch';
export { isSameDomain, parsePath, parseSearchParams } from './url';
