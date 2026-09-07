// The conversion statement as a pure `sql` fragment (ADR-013). Converted 1:1
// from packages/db/src/services/conversion.service.ts (M7-004): the SQL text
// is V1's clix output, with the project id, event names, dates, the funnel
// window and the interval bucket bound as `{pN:Type}` parameters instead of
// inlined literals. Result-set proof: conversion.sql.proof.md.
//
// The field resolver and filter compiler still render text (see compiled.ts);
// their output — breakdown expressions, per-step filter clauses and the
// cohort joins — is spliced, everything else is bound.
//
// Cluster note (docs/ENVIRONMENT.md): `events`, `profiles` and `groups` are
// Distributed on Cloud. The profile / group / cohort joins keep V1's exact
// LEFT ANY JOIN shape and run under the client's
// `distributed_product_mode: 'allow'` as before; no `IN (subquery)` is
// introduced or removed.

import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IInterval } from '../../report/report.constants';
import { compiledText } from './compiled';
import { CHART_TABLE } from './field-resolution';

/** windowFunnel counts a conversion when both steps fired. */
const CONVERTED_STEP_COUNT = 2;
const CONVERSION_RATE_DECIMALS = 2;

/** The two grouping keys the funnel may be computed per — a closed set. */
const CONVERSION_GROUPS = ['session_id', 'profile_id'] as const;
export type ConversionGroup = (typeof CONVERSION_GROUPS)[number];

/** V1 `clix.toStartOf(created_at, interval)` — no timezone argument. */
function intervalBucket(interval: IInterval): SqlFragment {
  switch (interval) {
    case 'minute':
      return sql`toStartOfMinute(created_at)`;
    case 'hour':
      return sql`toStartOfHour(created_at)`;
    case 'week':
      return sql`toStartOfWeek(toDateTime(created_at))`;
    case 'month':
      return sql`toStartOfMonth(toDateTime(created_at))`;
    default:
      return sql`toStartOfDay(created_at)`;
  }
}

export interface ConversionQueryInput {
  projectId: string;
  startDate: string;
  endDate: string;
  interval: IInterval;
  group: ConversionGroup;
  /** Funnel window in seconds. */
  funnelWindowSeconds: number;
  firstEventName: string;
  secondEventName: string;
  /** Compiled filters per step (`null` when the step has no filters). */
  firstEventWhere: SqlFragment | null;
  secondEventWhere: SqlFragment | null;
  /** Compiled `<expr> as b_<index>` breakdown selects. */
  breakdownSelects: string[];
  /** Compiled breakdown expressions, as written in the inner GROUP BY. */
  breakdownExpressions: string[];
  /** Profile columns to select in the LEFT ANY JOIN, or [] for no join. */
  profileJoinFields: string[];
  needsGroupArrayJoin: boolean;
  /** Compiled cohort join clauses. */
  cohortJoins: string[];
}

function stepCondition(name: string, where: SqlFragment | null): SqlFragment {
  return where
    ? sql`(events.name = ${sql.string(name)} AND ${where})`
    : sql`events.name = ${sql.string(name)}`;
}

function profileJoin(fields: string[], projectId: string): SqlFragment {
  if (fields.length === 0) {
    return sql.empty;
  }
  // Simple column names (not aliased) so profile.properties works directly.
  return sql`LEFT ANY JOIN (
        SELECT ${sql.join(fields.map((field) => sql.id(field)))}
        FROM ${sql.id(CHART_TABLE.profiles)} FINAL
        WHERE project_id = ${sql.string(projectId)}
      ) as profile ON profile.id = profile_id`;
}

function groupJoin(needed: boolean, projectId: string): SqlFragment {
  return needed
    ? sql`ARRAY JOIN groups AS _group_id LEFT ANY JOIN (SELECT id, name, type, properties FROM ${sql.id(CHART_TABLE.groups)} FINAL WHERE project_id = ${sql.string(projectId)}) AS _g ON _g.id = _group_id`
    : sql.empty;
}

/** V1 `ConversionService.getConversion`: one windowFunnel scan per bucket. */
export function conversionQuery(input: ConversionQueryInput): SqlFragment {
  const {
    projectId,
    startDate,
    endDate,
    interval,
    group,
    funnelWindowSeconds,
    firstEventName,
    secondEventName,
    firstEventWhere,
    secondEventWhere,
    breakdownSelects,
    breakdownExpressions,
    profileJoinFields,
    needsGroupArrayJoin,
    cohortJoins,
  } = input;

  const groupKey = sql.id(group, CONVERSION_GROUPS);
  const breakdownAliases = breakdownSelects.map((_, index) =>
    compiledText(`b_${index}`)
  );
  const outerKeys = [sql`event_day`, ...breakdownAliases];
  const converted = sql`countIf(steps >= ${sql.uint64(CONVERTED_STEP_COUNT)})`;

  const outerSelect = sql.join([
    sql`event_day`,
    ...breakdownAliases,
    sql`uniqExact(${groupKey}) AS total_first`,
    sql`${converted} AS conversions`,
    sql`round(100.0 * ${converted} / uniqExact(${groupKey}), ${sql.uint64(CONVERSION_RATE_DECIMALS)}) AS conversion_rate_percentage`,
  ]);

  const innerBreakdownSelects =
    breakdownSelects.length > 0
      ? sql`${sql.join(breakdownSelects.map(compiledText))},`
      : sql.empty;
  const innerBreakdownGroupBy =
    breakdownExpressions.length > 0
      ? sql`, ${sql.join(breakdownExpressions.map(compiledText))}`
      : sql.empty;

  return sql`SELECT ${outerSelect} FROM (
        (SELECT
          ${groupKey},
          any(${intervalBucket(interval)}) as event_day,
          ${innerBreakdownSelects}
          windowFunnel(${sql.uint64(funnelWindowSeconds)})(
            toDateTime(created_at),
            ${stepCondition(firstEventName, firstEventWhere)},
            ${stepCondition(secondEventName, secondEventWhere)}
          ) as steps
        FROM ${sql.id(CHART_TABLE.events)}
        ${profileJoin(profileJoinFields, projectId)}
        ${groupJoin(needsGroupArrayJoin, projectId)}
        ${sql.join(cohortJoins.map(compiledText), ' ')}
        WHERE project_id = ${sql.string(projectId)}
          AND events.name IN ${sql.array('String', [firstEventName, secondEventName])}
          AND created_at BETWEEN toDateTime(${sql.string(startDate)}) AND toDateTime(${sql.string(endDate)})
        GROUP BY ${groupKey}${innerBreakdownGroupBy})
      ) WHERE steps > 0 GROUP BY ${sql.join(outerKeys)} ORDER BY ${sql.join(outerKeys.map((key) => sql`${key} ASC`))}`;
}
