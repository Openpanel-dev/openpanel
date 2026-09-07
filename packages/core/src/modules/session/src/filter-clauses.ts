// The ONE place this module splices pre-compiled filter SQL.
//
// `buildFilterWhere` (../../chart/src/table-filter-where.ts) is V1's
// sessions/profiles/events-table filter compiler; it returns bound
// `SqlFragment`s since M12-003, as `getEventFiltersWhereClause`
// (../../chart/src/filter-where.ts) has since M12-002. Nothing is bridged any
// more — this file only assembles what the compiler already produced.

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
