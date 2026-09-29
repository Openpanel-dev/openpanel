// The ONE place this module splices pre-compiled filter SQL.
//
// `buildFilterWhere` (../../chart/src/table-filter-where.ts) is the
// sessions/profiles/events-table filter compiler; it returns bound
// `SqlFragment`s, same as `getEventFiltersWhereClause`
// (../../chart/src/filter-where.ts). Nothing is bridged any more — this file
// only assembles what the compiler already produced.

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
