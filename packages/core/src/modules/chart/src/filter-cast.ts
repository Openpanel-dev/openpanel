/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
// Moved from packages/db/src/services/filter-cast.ts (M8-005) — the typed-cast
// half of `buildFilterWhere` (./table-filter-where.ts) and of
// `./filter-where.ts` (the event-property compiler).
//
// Two twins live here for the length of the P12 conversion: the `*Fragment`
// pair binds every value as a `{name:Type}` param and is what `filter-where.ts`
// calls (M12-002); `castSql` / `buildTypedClause` still render sqlstring-escaped
// TEXT for `table-filter-where.ts` and die with it (M12-003). The cast
// expressions must stay byte-identical between the two.

import {
  type SqlFragment,
  type SqlSlot,
  sql,
} from '@openpanel/db/src/clickhouse/sql';
import sqlstring from 'sqlstring';
import type {
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IChartFilterValueType,
} from '../../report/report.constants';

/**
 * Wrap a SQL expression (a column accessor or an already-escaped value literal)
 * in the ClickHouse cast matching the filter's declared value type.
 *
 * `toString(...)` first so the helper works uniformly on String properties
 * (`properties['x']`) and already-numeric columns (`duration`, `revenue`).
 * The `*OrNull` variants mean an unparseable value becomes NULL (no match)
 * instead of throwing and crashing the whole query — e.g. `toFloat64('abc')`
 * would error, `toFloat64OrNull('abc')` yields NULL.
 */
export function castSql(expr: string, type?: IChartFilterValueType): string {
  switch (type) {
    case 'number':
      return `toFloat64OrNull(toString(${expr}))`;
    case 'date':
      // Parse with best-effort first, then truncate to a date. `toDateOrNull`
      // is strict — it rejects loose formats like 'YYYY-MM-DD HH:MM' (no
      // seconds) and returns NULL, which silently drops every row. Best-effort
      // handles those, and toDate(NULL) stays NULL so bad values still no-match.
      return `toDate(parseDateTimeBestEffortOrNull(toString(${expr})))`;
    case 'datetime':
      return `parseDateTimeBestEffortOrNull(toString(${expr}))`;
    case 'boolean':
      return `if(lower(trim(toString(${expr}))) IN ('true', '1', 'yes'), 1, 0)`;
    case 'string':
    case undefined:
      return expr;
  }
}

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
// unaffected and keep their existing handling.
const TYPED_SQL_OPERATOR: Partial<Record<IChartEventFilterOperator, string>> = {
  is: '=',
  isNot: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

// The same six operators as fragments. `sql`'s slots reject a bare string, so
// the operator has to arrive as SQL, not as text — and a closed literal map is
// the only place it can come from.
const TYPED_SQL_OPERATOR_FRAGMENT: Partial<
  Record<IChartEventFilterOperator, SqlSlot>
> = {
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

/** {@link castSql} as a fragment. Keep the emitted expressions identical. */
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
 * every value are cast to `type`. `leftExpr` is the raw column accessor (e.g.
 * `e.properties['cook']`, a bare column name, or `x` inside an arrayExists
 * lambda). Values are escaped here.
 *
 * `is`/`gt`/`gte`/`lt`/`lte` OR the per-value predicates together (match any);
 * `isNot` ANDs them (must differ from all), matching the NOT-IN semantics of
 * the untyped path.
 */
export function buildTypedClause(
  leftExpr: string,
  operator: IChartEventFilterOperator,
  value: IChartEventFilterValue[],
  type: IChartFilterValueType
): string {
  const sqlOp = TYPED_SQL_OPERATOR[operator] ?? '=';
  const left = castSql(leftExpr, type);
  const joiner = operator === 'isNot' ? ' AND ' : ' OR ';
  return `(${value
    .map((val) => {
      const escaped = sqlstring.escape(
        typeof val === 'string' ? val.trim() : val
      );
      return `${left} ${sqlOp} ${castSql(escaped, type)}`;
    })
    .join(joiner)})`;
}

/** {@link buildTypedClause} with every value bound instead of escaped. */
export function buildTypedClauseFragment(
  leftExpr: SqlSlot,
  operator: IChartEventFilterOperator,
  value: IChartEventFilterValue[],
  type: IChartFilterValueType
): SqlFragment {
  const sqlOp = TYPED_SQL_OPERATOR_FRAGMENT[operator] ?? sql`=`;
  const left = castFragment(leftExpr, type);
  const joiner = operator === 'isNot' ? ' AND ' : ' OR ';
  return sql`(${sql.join(
    value.map(
      (val) => sql`${left} ${sqlOp} ${castFragment(typedValueParam(val), type)}`
    ),
    joiner
  )})`;
}
