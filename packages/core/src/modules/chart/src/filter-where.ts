/** biome-ignore-all lint/style/useDefaultSwitchClause: operator switches are exhaustive by design */
// The event filter compiler (`getEventFiltersWhereClause`), built on the
// `sql` tag: every VALUE binds as a `{name:Type}` param and every identifier
// goes through `sql.id` or a static fragment. The column expression for a
// `properties.*` / `group.*` filter comes from field-resolution.ts, which
// returns a fragment of its own and is interpolated directly.

import {
  type SqlFragment,
  type SqlSlot,
  sql,
} from '@openpanel/db/src/clickhouse/sql';
import { stripLeadingAndTrailingSlashes } from '@openpanel/shared';
import type { IChartEventFilter } from '../../report/report.constants';
import { getCohortIds } from '../../report/report.constants';
import {
  buildCohortMembersSubselect,
  EVENT_FIELD_ALIASES,
  EVENT_TOP_LEVEL_COLUMNS,
  getGroupPropertySql,
  getSelectPropertyKey,
  isNumericColumn,
  isWildcardPropertyKey,
  normalizeEventField,
} from './field-resolution';
import {
  buildTypedClauseFragment,
  hasTypedCast,
  isTypedOperator,
} from './filter-cast';

export type FilterTableScope = 'events' | 'sessions';

/** One clause per surviving filter, keyed `f<index>`. */
export type CompiledEventFilters = Record<string, SqlFragment>;

// `sql.id`'s whitelist takes an array; the events branch has already rejected
// anything outside the set by the time it gets here.
const EVENT_COLUMN_ALLOWLIST = Array.from(EVENT_TOP_LEVEL_COLUMNS);

function filterValue(value: unknown) {
  return sql.string(String(value).trim());
}

function anyOf(clauses: SqlFragment[]): SqlFragment {
  return sql`(${sql.join(clauses, ' OR ')})`;
}

/** No outer parentheses, unlike `anyOf` — `arrayExists` already wraps its predicate. */
function anyItem(clauses: SqlFragment[], haystack: SqlSlot): SqlFragment {
  return sql`arrayExists(x -> ${sql.join(clauses, ' OR ')}, ${haystack})`;
}

/**
 * Combine compiled clauses the way every caller that wants one expression
 * does. `null` when nothing survived, so a caller can drop the `AND` with it.
 */
export function joinFilterClauses(
  clauses: CompiledEventFilters
): SqlFragment | null {
  const parts = Object.values(clauses);
  return parts.length === 0 ? null : sql.join(parts, ' AND ');
}

export function getEventFiltersWhereClause(
  filters: IChartEventFilter[],
  projectId?: string,
  /**
   * See `getSelectPropertyKey`. When the surrounding query joins another
   * table that has a `properties` column (e.g. the `_g` groups join), the
   * events table must be aliased and passed here so we can emit
   * `e.properties[...]` instead of the ambiguous `properties[...]`.
   */
  eventsAlias?: string,
  /**
   * Which physical table the WHERE clause is being built for. Affects which
   * names count as "top-level columns" and whether bare `utm_*` gets routed
   * into the events-specific `properties.__query.utm_*` map. Defaults to
   * 'events' because that's where the vast majority of callers (chart,
   * funnel, conversion, sankey, event services) target — OverviewService
   * sets it to 'sessions' when querying the sessions table.
   */
  tableScope: FilterTableScope = 'events'
): CompiledEventFilters {
  const where: CompiledEventFilters = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    const { value, operator } = filter;
    // Normalize camelCase aliases (`referrerName` → `referrer_name`) on both
    // tables — both events and sessions schemas use snake_case. The bare-
    // utm rewrite only applies to events because sessions stores utm_* as
    // real top-level columns; doing it for sessions would emit
    // `properties['__query.utm_source']` against a table that has no
    // `properties` column.
    const name =
      tableScope === 'sessions'
        ? (EVENT_FIELD_ALIASES[filter.name] ?? filter.name)
        : normalizeEventField(filter.name);

    if ((operator === 'inCohort' || operator === 'notInCohort') && projectId) {
      // Self-contained membership subselect — no caller JOIN wiring needed.
      // Cohort filters and cohort breakdowns are decoupled: the breakdown
      // path (getSelectPropertyKey) still uses a JOIN alias for SELECT
      // expressions, but filters never depend on it.
      const cohortIds = getCohortIds(filter);
      if (cohortIds.length === 0) {
        return;
      }
      const profileIdExpr = eventsAlias
        ? sql.id(`${eventsAlias}.profile_id`)
        : sql.id('profile_id');
      const members = buildCohortMembersSubselect(cohortIds, projectId);
      where[id] =
        operator === 'notInCohort'
          ? sql`${profileIdExpr} NOT IN ${members}`
          : sql`${profileIdExpr} IN ${members}`;
      return;
    }

    if (
      value.length === 0 &&
      operator !== 'isNull' &&
      operator !== 'isNotNull'
    ) {
      return;
    }

    if (name === 'has_profile') {
      if (value.includes('true')) {
        where[id] = sql`profile_id != device_id`;
      } else {
        where[id] = sql`profile_id = device_id`;
      }
      return;
    }

    // Handle group. prefixed filters (requires ARRAY JOIN + _g JOIN in query)
    if (name.startsWith('group.') && projectId) {
      const whereFrom = getGroupPropertySql(name);
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = buildTypedClauseFragment(
          whereFrom,
          operator,
          value,
          filter.type
        );
        return;
      }
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] = sql`${whereFrom} = ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${whereFrom} IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] = sql`${whereFrom} != ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${whereFrom} NOT IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'contains': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${whereFrom} LIKE ${sql.string(`%${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'doesNotContain': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${whereFrom} NOT LIKE ${sql.string(`%${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'startsWith': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${whereFrom} LIKE ${sql.string(`${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'endsWith': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${whereFrom} LIKE ${sql.string(`%${String(val).trim()}`)}`
            )
          );
          break;
        }
        case 'isNull': {
          where[id] = sql`(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = sql`(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          break;
        }
        case 'regex': {
          where[id] = anyOf(
            value.map((val) => sql`match(${whereFrom}, ${filterValue(val)})`)
          );
          break;
        }
      }
      return;
    }

    if (
      name.startsWith('properties.') ||
      name.startsWith('profile.properties.')
    ) {
      const whereFrom = getSelectPropertyKey(
        name,
        undefined,
        undefined,
        undefined,
        eventsAlias
      );
      const isWildcard = isWildcardPropertyKey(name);

      // Typed cast (number/date/datetime/boolean) short-circuit. Casts both the
      // column and each value so e.g. `>= '2019-01-01'` compares as dates
      // instead of crashing `toFloat64('2019-01-01')`. Untyped/string filters
      // fall through to the legacy switch below.
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = isWildcard
          ? sql`arrayExists(x -> ${buildTypedClauseFragment(sql`x`, operator, value, filter.type)}, ${whereFrom})`
          : buildTypedClauseFragment(whereFrom, operator, value, filter.type);
        return;
      }

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = anyItem(
              value.map((val) => sql`x = ${filterValue(val)}`),
              whereFrom
            );
          } else if (value.length === 1) {
            where[id] = sql`${whereFrom} = ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${whereFrom} IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = anyItem(
              value.map((val) => sql`x != ${filterValue(val)}`),
              whereFrom
            );
          } else if (value.length === 1) {
            where[id] = sql`${whereFrom} != ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${whereFrom} NOT IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'contains': {
          const like = (val: unknown) => sql.string(`%${String(val).trim()}%`);
          where[id] = isWildcard
            ? anyItem(
                value.map((val) => sql`x LIKE ${like(val)}`),
                whereFrom
              )
            : anyOf(value.map((val) => sql`${whereFrom} LIKE ${like(val)}`));
          break;
        }
        case 'doesNotContain': {
          const like = (val: unknown) => sql.string(`%${String(val).trim()}%`);
          where[id] = isWildcard
            ? anyItem(
                value.map((val) => sql`x NOT LIKE ${like(val)}`),
                whereFrom
              )
            : anyOf(
                value.map((val) => sql`${whereFrom} NOT LIKE ${like(val)}`)
              );
          break;
        }
        case 'startsWith': {
          const like = (val: unknown) => sql.string(`${String(val).trim()}%`);
          where[id] = isWildcard
            ? anyItem(
                value.map((val) => sql`x LIKE ${like(val)}`),
                whereFrom
              )
            : anyOf(value.map((val) => sql`${whereFrom} LIKE ${like(val)}`));
          break;
        }
        case 'endsWith': {
          const like = (val: unknown) => sql.string(`%${String(val).trim()}`);
          where[id] = isWildcard
            ? anyItem(
                value.map((val) => sql`x LIKE ${like(val)}`),
                whereFrom
              )
            : anyOf(value.map((val) => sql`${whereFrom} LIKE ${like(val)}`));
          break;
        }
        case 'regex': {
          where[id] = isWildcard
            ? anyItem(
                value.map((val) => sql`match(x, ${filterValue(val)})`),
                whereFrom
              )
            : anyOf(
                value.map(
                  (val) => sql`match(${whereFrom}, ${filterValue(val)})`
                )
              );
          break;
        }
        case 'isNull': {
          where[id] = isWildcard
            ? sql`arrayExists(x -> x = '' OR x IS NULL, ${whereFrom})`
            : sql`(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = isWildcard
            ? sql`arrayExists(x -> x != '' AND x IS NOT NULL, ${whereFrom})`
            : sql`(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          break;
        }
        case 'gt': {
          where[id] = isWildcard
            ? anyItem(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(x) > toFloat64(${filterValue(val)})`
                ),
                whereFrom
              )
            : anyOf(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(${whereFrom}) > toFloat64(${filterValue(val)})`
                )
              );
          break;
        }
        case 'lt': {
          where[id] = isWildcard
            ? anyItem(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(x) < toFloat64(${filterValue(val)})`
                ),
                whereFrom
              )
            : anyOf(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(${whereFrom}) < toFloat64(${filterValue(val)})`
                )
              );
          break;
        }
        case 'gte': {
          where[id] = isWildcard
            ? anyItem(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(x) >= toFloat64(${filterValue(val)})`
                ),
                whereFrom
              )
            : anyOf(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(${whereFrom}) >= toFloat64(${filterValue(val)})`
                )
              );
          break;
        }
        case 'lte': {
          where[id] = isWildcard
            ? anyItem(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(x) <= toFloat64(${filterValue(val)})`
                ),
                whereFrom
              )
            : anyOf(
                value.map(
                  (val) =>
                    sql`toFloat64OrZero(${whereFrom}) <= toFloat64(${filterValue(val)})`
                )
              );
          break;
        }
      }
    } else {
      // Bare-column branch. For events queries: enforce that `name` is one
      // of the known top-level columns (anything else would crash parse with
      // UNKNOWN_IDENTIFIER). For sessions queries: skip the guard because
      // the sessions table has its own column set (utm_*, entry_path, etc.)
      // that OverviewService.getRawWhereClause already vets via its
      // WHITELISTED_FILTERS pre-pass.
      if (tableScope === 'events' && !EVENT_TOP_LEVEL_COLUMNS.has(name)) {
        return;
      }
      // The sessions branch has no closed set here, so `sql.id` validates the
      // shape and throws rather than inlining anything else.
      const column =
        tableScope === 'events'
          ? sql.id(name, EVENT_COLUMN_ALLOWLIST)
          : sql.id(name);
      // Typed cast short-circuit (see property branch above). Supersedes the
      // `isNumericColumn` auto-detect when the user declared an explicit type.
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = buildTypedClauseFragment(
          column,
          operator,
          value,
          filter.type
        );
        return;
      }
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] = sql`${column} = ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${column} IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'isNull': {
          where[id] = sql`(${column} = '' OR ${column} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = sql`(${column} != '' AND ${column} IS NOT NULL)`;
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] = sql`${column} != ${filterValue(value[0])}`;
          } else {
            where[id] = sql`${column} NOT IN ${sql.array(
              'String',
              value.map((val) => String(val).trim())
            )}`;
          }
          break;
        }
        case 'contains': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${column} LIKE ${sql.string(`%${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'doesNotContain': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${column} NOT LIKE ${sql.string(`%${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'startsWith': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${column} LIKE ${sql.string(`${String(val).trim()}%`)}`
            )
          );
          break;
        }
        case 'endsWith': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`${column} LIKE ${sql.string(`%${String(val).trim()}`)}`
            )
          );
          break;
        }
        case 'regex': {
          where[id] = anyOf(
            value.map(
              (val) =>
                sql`match(${column}, ${sql.string(stripLeadingAndTrailingSlashes(String(val)).trim())})`
            )
          );
          break;
        }
        case 'gt': {
          where[id] = anyOf(
            value.map((val) =>
              isNumericColumn(name)
                ? sql`toFloat64(${column}) > toFloat64(${filterValue(val)})`
                : sql`${column} > ${filterValue(val)}`
            )
          );
          break;
        }
        case 'lt': {
          where[id] = anyOf(
            value.map((val) =>
              isNumericColumn(name)
                ? sql`toFloat64(${column}) < toFloat64(${filterValue(val)})`
                : sql`${column} < ${filterValue(val)}`
            )
          );
          break;
        }
        case 'gte': {
          where[id] = anyOf(
            value.map((val) =>
              isNumericColumn(name)
                ? sql`toFloat64(${column}) >= toFloat64(${filterValue(val)})`
                : sql`${column} >= ${filterValue(val)}`
            )
          );
          break;
        }
        case 'lte': {
          where[id] = anyOf(
            value.map((val) =>
              isNumericColumn(name)
                ? sql`toFloat64(${column}) <= toFloat64(${filterValue(val)})`
                : sql`${column} <= ${filterValue(val)}`
            )
          );
          break;
        }
      }
    }
  });

  return where;
}
