// The ONE place this module splices pre-compiled filter SQL: it only assembles what
// the filter compilers (chart/src/table-filter-where.ts, chart/src/filter-where.ts)
// already produced.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';

export type CompiledFilterClauses = Record<string, SqlFragment>;

/** Each compiled clause is already parenthesised by the compiler. */
export function compiledFilterFragments(
  clauses: CompiledFilterClauses
): SqlFragment[] {
  return Object.values(clauses);
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
