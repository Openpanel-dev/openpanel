/** biome-ignore-all lint/style/useDefaultSwitchClause: switch cases are exhaustive by design */
import type {
  IChartEventFilterOperator,
  IChartEventFilterValue,
  IChartFilterValueType,
} from '@openpanel/validation';
import sqlstring from 'sqlstring';

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
  type?: IChartFilterValueType,
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

export function isTypedOperator(operator: IChartEventFilterOperator): boolean {
  return operator in TYPED_SQL_OPERATOR;
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
  type: IChartFilterValueType,
): string {
  const sqlOp = TYPED_SQL_OPERATOR[operator] ?? '=';
  const left = castSql(leftExpr, type);
  const joiner = operator === 'isNot' ? ' AND ' : ' OR ';
  return `(${value
    .map((val) => {
      const escaped = sqlstring.escape(
        typeof val === 'string' ? val.trim() : val,
      );
      return `${left} ${sqlOp} ${castSql(escaped, type)}`;
    })
    .join(joiner)})`;
}
