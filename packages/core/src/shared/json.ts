// A re-export seam, not an implementation: the JSON helpers live in
// @openpanel/shared, and every caller inside core imports them from there.
//
// This file survives for ONE importer: packages/db/src/clickhouse/client.ts
// reaches `getSafeJson` by relative path across the package boundary
// (`../../../core/src/shared/json`), because core depends on @openpanel/db and
// importing the core barrel there would invert that edge. That import is
// pointed at the wrong package — the fix is one line in packages/db. Delete
// this file with it.
export { getSafeJson, getSuperJson, setSuperJson } from '@openpanel/shared';
