// The ONE place this module splices pre-compiled filter SQL.
//
// `buildFilterWhere` (../../chart/src/table-filter-where.ts) is V1's
// sessions/profiles/events-table filter compiler and still emits
// sqlstring-escaped SQL text; ADR-013 converts it in M12-003. Until then its
// output crosses into a fragment here — through the same `SqlFragment`
// constructor `sql.id` uses — so the bridge is one grep away from deletion
// when the compiler moves, rather than a `sql.raw()` that would outlive it.
// `getEventFiltersWhereClause` (../../chart/src/filter-where.ts) already
// returns fragments (M12-002) and needs no bridge.

import { SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

export type CompiledFilterClauses = Record<string, SqlFragment>;

/** Bridge `buildFilterWhere`'s compiled TEXT into fragments. */
export function compiledFilterClauses(
  clauses: Record<string, string>
): CompiledFilterClauses {
  const compiled: CompiledFilterClauses = {};
  for (const [key, clause] of Object.entries(clauses)) {
    compiled[key] = new SqlFragment([clause], []);
  }
  return compiled;
}

export function spliceCompiledFilters(
  clauses: CompiledFilterClauses
): SqlFragment {
  const fragments = Object.values(clauses);
  if (fragments.length === 0) {
    return sql.empty;
  }
  return sql`AND ${sql.join(fragments, ' AND ')}`;
}
