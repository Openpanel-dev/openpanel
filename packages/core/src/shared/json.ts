// A re-export seam kept for ONE importer: packages/db/src/clickhouse/client.ts
// reaches `getSafeJson` by relative path (`../../../core/src/shared/json`)
// because importing the core barrel there would invert the core -> db edge.
// That import should point at @openpanel/shared; delete this file with it.
export { getSafeJson, getSuperJson, setSuperJson } from '@openpanel/shared';
