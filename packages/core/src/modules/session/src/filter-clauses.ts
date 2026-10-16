// The ONE place this module splices pre-compiled filter SQL: it only assembles what
// the filter compilers (chart/src/table-filter-where.ts, chart/src/filter-where.ts)
// already produced.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

export type CompiledFilterClauses = Record<string, SqlFragment>;

export function spliceCompiledFilters(
  clauses: CompiledFilterClauses
): SqlFragment {
  const fragments = Object.values(clauses);
  if (fragments.length === 0) {
    return sql.empty;
  }
  return sql`AND ${sql.join(fragments, ' AND ')}`;
}
