/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
// Moved from packages/db/src/services/filter-cast.ts — the typed-cast half of
// `buildFilterWhere` (./table-filter-where.ts) and of `./filter-where.ts` (the
// event-property compiler).
//
// Both filter compilers call the same pair now: `castFragment` and
// `buildTypedClauseFragment` bind every value as a `{name:Type}` param. The
// sqlstring-escaped text twins (`castSql` / `buildTypedClause`) died with
// `table-filter-where.ts`'s conversion in M12-003.

import {
  type SqlFragment,
  type SqlSlot,
  sql,
} from '@openpanel/db/src/clickhouse/sql';
import type {
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IChartFilterValueType,
} from '../../report/report.constants';

/**
 * True when a non-string cast should be applied. `string` and `undefined`
 * (legacy filters with no declared type) fall through to the existing raw
 * comparison logic so behavior is unchanged.
 */
export function hasTypedCast(
  type?: IChartFilterValueType
): type is IChartFilterValueType {
  return !!type && type !== 'string';
}

// Equality + comparison operators where a declared cast type changes the SQL.
// String-only operators (contains/startsWith/regex/…) and null checks are
// unaffected and keep their existing handling. `sql`'s slots reject a bare
// string, so the operator arrives as SQL, from a closed literal map.
const TYPED_SQL_OPERATOR: Partial<Record<IChartEventFilterOperator, SqlSlot>> =
  {
    is: sql`=`,
    isNot: sql`!=`,
    gt: sql`>`,
    gte: sql`>=`,
    lt: sql`<`,
    lte: sql`<=`,
  };

export function isTypedOperator(operator: IChartEventFilterOperator): boolean {
  return operator in TYPED_SQL_OPERATOR;
}

/**
 * Wrap a SQL expression (a column accessor or a bound value) in the ClickHouse
 * cast matching the filter's declared value type.
 *
 * `toString(...)` first so the helper works uniformly on String properties
 * (`properties['x']`) and already-numeric columns (`duration`, `revenue`).
 * The `*OrNull` variants mean an unparseable value becomes NULL (no match)
 * instead of throwing and crashing the whole query — e.g. `toFloat64('abc')`
 * would error, `toFloat64OrNull('abc')` yields NULL.
 */
export function castFragment(
  expr: SqlSlot,
  type?: IChartFilterValueType
): SqlSlot {
  switch (type) {
    case 'number':
      return sql`toFloat64OrNull(toString(${expr}))`;
    case 'date':
      return sql`toDate(parseDateTimeBestEffortOrNull(toString(${expr})))`;
    case 'datetime':
      return sql`parseDateTimeBestEffortOrNull(toString(${expr}))`;
    case 'boolean':
      return sql`if(lower(trim(toString(${expr}))) IN ('true', '1', 'yes'), 1, 0)`;
    case 'string':
    case undefined:
      return expr;
  }
}

/**
 * Bind one filter value the way `sqlstring.escape` rendered it: a string is a
 * quoted literal, a number a numeric literal, a boolean `true`/`false`, and
 * `null` the SQL keyword NULL — which only `Nullable` reproduces, since a
 * `String` param bound to null arrives as the empty string.
 */
function typedValueParam(value: IChartEventFilterValue): SqlSlot {
  if (value === null) {
    return sql.nullable('String', null);
  }
  if (typeof value === 'number') {
    return sql.float64(value);
  }
  if (typeof value === 'boolean') {
    return sql.bool(value);
  }
  return sql.string(value.trim());
}

/**
 * Build a parenthesized comparison clause where both the column expression and
 * every value are cast to `type`. `leftExpr` is the column accessor (e.g.
 * `e.properties['cook']`, a bare column name, or `x` inside an arrayExists
 * lambda). Values are bound here.
 *
 * `is`/`gt`/`gte`/`lt`/`lte` OR the per-value predicates together (match any);
 * `isNot` ANDs them (must differ from all), matching the NOT-IN semantics of
 * the untyped path.
 */
export function buildTypedClauseFragment(
  leftExpr: SqlSlot,
  operator: IChartEventFilterOperator,
  value: IChartEventFilterValue[],
  type: IChartFilterValueType
): SqlFragment {
  const sqlOp = TYPED_SQL_OPERATOR[operator] ?? sql`=`;
  const left = castFragment(leftExpr, type);
  const joiner = operator === 'isNot' ? ' AND ' : ' OR ';
  return sql`(${sql.join(
    value.map(
      (val) => sql`${left} ${sqlOp} ${castFragment(typedValueParam(val), type)}`
    ),
    joiner
  )})`;
}
