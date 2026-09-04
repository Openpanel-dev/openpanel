// The ONE place this module splices pre-compiled filter SQL.
//
// `buildFilterWhere` (../../chart/src/table-filter-where.ts) is
// V1's filter compiler and still emits sqlstring-escaped SQL text: ADR-013
// leaves the filter compilers as they are ("two behaviours, not two builders")
// until the shared filter compiler converts to fragments. Until then a
// `sql`-tag query that takes `IChartEventFilter[]` has to splice that text,
// and it does so here — through the same `SqlFragment` constructor `sql.id`
// uses — so the bridge is one grep away from deletion when the compiler moves,
// rather than a `sql.raw()` that would outlive it.

import { SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

export type CompiledFilterClauses = Record<string, string>;

/** Each compiled clause is already parenthesised by the compiler. */
export function compiledFilterFragments(
  clauses: CompiledFilterClauses
): SqlFragment[] {
  return Object.values(clauses).map((clause) => new SqlFragment([clause], []));
}

export function spliceCompiledFilters(
  clauses: CompiledFilterClauses
): SqlFragment {
  const fragments = compiledFilterFragments(clauses);
  if (fragments.length === 0) {
    return sql.empty;
  }
  return sql`AND ${sql.join(fragments, ' AND ')}`;
}
