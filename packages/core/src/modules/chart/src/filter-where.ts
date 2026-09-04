/** biome-ignore-all lint/style/useDefaultSwitchClause: operator switches are exhaustive by design */
// V1's event filter compiler (`getEventFiltersWhereClause`), moved verbatim
// from packages/db/src/services/chart.service.ts (M7-003). Renders TEXT with
// sqlstring: ADR-013 keeps the shared filter compilers as they are until
// funnel, conversion, sankey, retention and overview (M7-004/M7-005) stop
// splicing their output into text builders. Core splices it through
// compiled.ts, the one text bridge.

import { stripLeadingAndTrailingSlashes } from '@openpanel/common';
import {
  buildTypedClause,
  hasTypedCast,
  isTypedOperator,
} from '@openpanel/db/src/services/filter-cast';
import type { IChartEventFilter } from '@openpanel/validation';
import { getCohortIds } from '@openpanel/validation';
import sqlstring from 'sqlstring';
import {
  CHART_TABLE,
  EVENT_FIELD_ALIASES,
  EVENT_TOP_LEVEL_COLUMNS,
  getGroupPropertySql,
  getSelectPropertyKey,
  isNumericColumn,
  normalizeEventField,
} from './field-resolution';

export type FilterTableScope = 'events' | 'sessions';

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
) {
  const where: Record<string, string> = {};
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
        ? `${eventsAlias}.profile_id`
        : 'profile_id';
      const op = operator === 'notInCohort' ? 'NOT IN' : 'IN';
      const escapedIds = cohortIds.map((c) => sqlstring.escape(c)).join(', ');
      where[id] =
        `${profileIdExpr} ${op} (SELECT profile_id FROM ${CHART_TABLE.cohortMembers} FINAL WHERE cohort_id IN (${escapedIds}) AND project_id = ${sqlstring.escape(projectId)})`;
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
        where[id] = 'profile_id != device_id';
      } else {
        where[id] = 'profile_id = device_id';
      }
      return;
    }

    // Handle group. prefixed filters (requires ARRAY JOIN + _g JOIN in query)
    if (name.startsWith('group.') && projectId) {
      const whereFrom = getGroupPropertySql(name);
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = buildTypedClause(whereFrom, operator, value, filter.type);
        return;
      }
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] =
              `${whereFrom} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] =
              `${whereFrom} IN (${value.map((val) => sqlstring.escape(String(val).trim())).join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] =
              `${whereFrom} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] =
              `${whereFrom} NOT IN (${value.map((val) => sqlstring.escape(String(val).trim())).join(', ')})`;
          }
          break;
        }
        case 'contains': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'doesNotContain': {
          where[id] =
            `(${value.map((val) => `${whereFrom} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'startsWith': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`).join(' OR ')})`;
          break;
        }
        case 'endsWith': {
          where[id] =
            `(${value.map((val) => `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`).join(' OR ')})`;
          break;
        }
        case 'isNull': {
          where[id] = `(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = `(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          break;
        }
        case 'regex': {
          where[id] =
            `(${value.map((val) => `match(${whereFrom}, ${sqlstring.escape(String(val).trim())})`).join(' OR ')})`;
          break;
        }
      }
      return;
    }

    if (
      name.startsWith('properties.') ||
      name.startsWith('profile.properties.')
    ) {
      const propertyKey = getSelectPropertyKey(
        name,
        undefined,
        undefined,
        undefined,
        eventsAlias
      );
      const isWildcard = propertyKey.includes('%');
      const whereFrom = propertyKey;

      // Typed cast (number/date/datetime/boolean) short-circuit. Casts both the
      // column and each value so e.g. `>= '2019-01-01'` compares as dates
      // instead of crashing `toFloat64('2019-01-01')`. Untyped/string filters
      // fall through to the legacy switch below.
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = isWildcard
          ? `arrayExists(x -> ${buildTypedClause('x', operator, value, filter.type)}, ${whereFrom})`
          : buildTypedClause(whereFrom, operator, value, filter.type);
        return;
      }

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x = ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else if (value.length === 1) {
            where[id] =
              `${whereFrom} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${whereFrom} IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x != ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else if (value.length === 1) {
            where[id] =
              `${whereFrom} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${whereFrom} NOT IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'contains': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'doesNotContain': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `x NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'startsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'endsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) => `x LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'regex': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `match(x, ${sqlstring.escape(String(val).trim())})`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `match(${whereFrom}, ${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'isNull': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> x = '' OR x IS NULL, ${whereFrom})`;
          } else {
            where[id] = `(${whereFrom} = '' OR ${whereFrom} IS NULL)`;
          }
          break;
        }
        case 'isNotNull': {
          if (isWildcard) {
            where[id] =
              `arrayExists(x -> x != '' AND x IS NOT NULL, ${whereFrom})`;
          } else {
            where[id] = `(${whereFrom} != '' AND ${whereFrom} IS NOT NULL)`;
          }
          break;
        }
        case 'gt': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) > toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) > toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lt': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) < toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) < toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'gte': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) >= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) >= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lte': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map(
                (val) =>
                  `toFloat64OrZero(x) <= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64OrZero(${whereFrom}) <= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          }
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
      // Typed cast short-circuit (see property branch above). Supersedes the
      // `isNumericColumn` auto-detect when the user declared an explicit type.
      if (hasTypedCast(filter.type) && isTypedOperator(operator)) {
        where[id] = buildTypedClause(name, operator, value, filter.type);
        return;
      }
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] =
              `${name} = ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNull': {
          where[id] = `(${name} = '' OR ${name} IS NULL)`;
          break;
        }
        case 'isNotNull': {
          where[id] = `(${name} != '' AND ${name} IS NOT NULL)`;
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] =
              `${name} != ${sqlstring.escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} NOT IN (${value
              .map((val) => sqlstring.escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'contains': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'doesNotContain': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} NOT LIKE ${sqlstring.escape(`%${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'startsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`${String(val).trim()}%`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'endsWith': {
          where[id] = `(${value
            .map(
              (val) =>
                `${name} LIKE ${sqlstring.escape(`%${String(val).trim()}`)}`
            )
            .join(' OR ')})`;
          break;
        }
        case 'regex': {
          where[id] = `(${value
            .map(
              (val) =>
                `match(${name}, ${sqlstring.escape(stripLeadingAndTrailingSlashes(String(val)).trim())})`
            )
            .join(' OR ')})`;
          break;
        }
        case 'gt': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) > toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map((val) => `${name} > ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')})`;
          }
          break;
        }
        case 'lt': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) < toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map((val) => `${name} < ${sqlstring.escape(String(val).trim())}`)
              .join(' OR ')})`;
          }
          break;
        }
        case 'gte': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) >= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} >= ${sqlstring.escape(String(val).trim())}`
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'lte': {
          if (isNumericColumn(name)) {
            where[id] = `(${value
              .map(
                (val) =>
                  `toFloat64(${name}) <= toFloat64(${sqlstring.escape(String(val).trim())})`
              )
              .join(' OR ')})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `${name} <= ${sqlstring.escape(String(val).trim())}`
              )
              .join(' OR ')})`;
          }
          break;
        }
      }
    }
  });

  return where;
}
