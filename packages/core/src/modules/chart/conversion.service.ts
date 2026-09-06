// Ported from packages/db/src/services/conversion.service.ts (M7-004). The
// statement is a `sql` fragment from src/conversion.sql.ts, proven
// byte-equivalent to V1 in src/conversion.sql.proof.md; V1's
// conversion.service is a re-export shim onto this module (DELEGATE PATTERN).

import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IReportInput } from '@openpanel/validation';
import { omit } from 'ramda';
import type { ServiceDeps } from '../../services';
import { mergeGlobalFilters, onlyReportEvents } from '../report/src/series';
import { fetchCohortsMetadata } from './src/chart-statement';
import { type ConversionGroup, conversionQuery } from './src/conversion.sql';
import {
  buildInlineCohortJoin,
  collectBreakdownCohortIds,
  extractCohortId,
  getSelectPropertyKey,
  isKnownEventField,
} from './src/field-resolution';
import { getEventFiltersWhereClause } from './src/filter-where';
import { runQuery } from './src/run-query';

/** Default funnel window, in hours, when the report does not set one. */
const DEFAULT_FUNNEL_WINDOW_HOURS = 24;
const SECONDS_PER_HOUR = 3600;

/** Profile columns the join may expose, beyond the `properties` Map. */
const JOINABLE_PROFILE_COLUMNS = [
  'email',
  'first_name',
  'last_name',
  'created_at',
  'last_seen_at',
];

const CONVERSION_STEP_COUNT = 2;

interface ConversionRow {
  event_day: string;
  total_first: number;
  conversions: number;
  conversion_rate_percentage: number;
  [key: string]: string | number;
}

interface ConversionSeriePoint {
  date: string;
  total: number;
  conversions: number;
  rate: number;
}

interface ConversionSerie {
  id: string;
  breakdowns: string[];
  data: ConversionSeriePoint[];
}

export type ConversionChartInput = Omit<
  IReportInput,
  'range' | 'previous' | 'metric' | 'chartType'
> & { timezone: string };

/**
 * The profile columns the LEFT ANY JOIN must expose for the requested
 * breakdowns. Empty means no join.
 */
function profileJoinFields(profileBreakdowns: { name: string }[]): string[] {
  if (profileBreakdowns.length === 0) {
    return [];
  }
  const fields = new Set<string>(['id']);
  for (const breakdown of profileBreakdowns) {
    const fieldName = breakdown.name.replace('profile.', '').split('.')[0];
    if (fieldName === 'properties') {
      fields.add('properties');
    } else if (fieldName && JOINABLE_PROFILE_COLUMNS.includes(fieldName)) {
      fields.add(fieldName);
    }
  }
  return Array.from(fields);
}

export async function getConversion(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    options,
    series,
    globalFilters,
    breakdowns = [],
    limit,
    interval,
    timezone,
  }: ConversionChartInput
) {
  const mergedSeries = mergeGlobalFilters(series, globalFilters);
  const funnelOptions = options?.type === 'funnel' ? options : undefined;
  const funnelGroup = funnelOptions?.funnelGroup;
  const funnelWindow =
    funnelOptions?.funnelWindow ?? DEFAULT_FUNNEL_WINDOW_HOURS;
  const group: ConversionGroup =
    funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';

  // Same guard as the funnel service / getChartSql — drop breakdowns whose
  // name can't be resolved against the events schema.
  const knownBreakdowns = breakdowns.filter((breakdown) =>
    isKnownEventField(breakdown.name)
  );

  const cohortIds = collectBreakdownCohortIds(knownBreakdowns);
  const cohortMetadata = await fetchCohortsMetadata(deps, cohortIds);
  const cohortJoins = cohortIds.map((id) =>
    buildInlineCohortJoin(id, projectId, 'events')
  );

  const breakdownExpressions = knownBreakdowns.map((breakdown) => {
    const cohortId = extractCohortId(breakdown.name);
    const cohortName = cohortId
      ? cohortMetadata.get(cohortId)?.name
      : undefined;
    return getSelectPropertyKey(
      breakdown.name,
      projectId,
      cohortId ?? undefined,
      cohortName
    );
  });
  const breakdownSelects = breakdownExpressions.map(
    (expression, index) => `${expression} as b_${index}`
  );

  const events = onlyReportEvents(mergedSeries);

  const anyBreakdownOnGroup = knownBreakdowns.some((breakdown) =>
    breakdown.name.startsWith('group.')
  );
  const anyFilterOnGroup = events.some((event) =>
    event.filters?.some((filter) => filter.name.startsWith('group.'))
  );

  if (events.length !== CONVERSION_STEP_COUNT) {
    throw new Error('events must be an array of two events');
  }

  if (!(startDate && endDate)) {
    throw new Error('startDate and endDate are required');
  }

  const eventA = events[0] as (typeof events)[number];
  const eventB = events[1] as (typeof events)[number];
  // Qualify with 'events' so event-level `properties[...]` becomes
  // `events.properties[...]` — required when the conversion query also joins
  // the profiles table (which exposes a `properties` column). Without the
  // qualifier ClickHouse fails with "ambiguous identifier 'properties'"
  // whenever a step filters on properties.X while a breakdown is on
  // profile.properties.Y.
  const whereA = Object.values(
    getEventFiltersWhereClause(eventA.filters, projectId, 'events')
  ).join(' AND ');
  const whereB = Object.values(
    getEventFiltersWhereClause(eventB.filters, projectId, 'events')
  ).join(' AND ');

  const results = await runQuery<ConversionRow>(
    deps,
    conversionQuery({
      projectId,
      startDate,
      endDate,
      interval,
      group,
      funnelWindowSeconds: funnelWindow * SECONDS_PER_HOUR,
      firstEventName: eventA.name,
      secondEventName: eventB.name,
      firstEventWhere: whereA,
      secondEventWhere: whereB,
      breakdownSelects,
      breakdownExpressions,
      profileJoinFields: profileJoinFields(
        knownBreakdowns.filter((breakdown) =>
          breakdown.name.startsWith('profile.')
        )
      ),
      needsGroupArrayJoin: anyBreakdownOnGroup || anyFilterOnGroup,
      cohortJoins,
    }),
    timezone
  );

  return toSeries(results, knownBreakdowns, limit).map((serie, serieIndex) => ({
    ...serie,
    data: serie.data.map((point, index) => ({
      ...point,
      timestamp: new Date(point.date).getTime(),
      serieIndex,
      index,
      serie: omit(['data'], serie),
    })),
  }));
}

function toPoint(row: ConversionRow): ConversionSeriePoint {
  return {
    date: row.event_day,
    total: row.total_first,
    conversions: row.conversions,
    rate: row.conversion_rate_percentage,
  };
}

function toSeries(
  data: ConversionRow[],
  breakdowns: { name: string }[] = [],
  limit: number | undefined = undefined
) {
  if (breakdowns.length === 0) {
    return [
      {
        id: 'conversion',
        breakdowns: [],
        data: data.map(toPoint),
      },
    ];
  }

  const series = data.reduce(
    (acc, row) => {
      if (limit && Object.keys(acc).length >= limit) {
        return acc;
      }

      const key =
        breakdowns.map((_, index) => row[`b_${index}`]).join('|') ||
        NOT_SET_VALUE;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          breakdowns: breakdowns.map(
            (_, index) => (row[`b_${index}`] || NOT_SET_VALUE) as string
          ),
          data: [],
        };
      }
      (acc[key] as ConversionSerie).data.push(toPoint(row));
      return acc;
    },
    {} as Record<string, ConversionSerie>
  );

  return Object.values(series).map((serie, serieIndex) => ({
    ...serie,
    data: serie.data.map((item, dataIndex) => ({
      ...item,
      dataIndex,
      serieIndex,
    })),
  }));
}

/** See funnel.service.ts's `createFunnelService` for why each chart
 *  sub-module carries its own factory (M10-009, ADR-007). */
export interface ConversionService {
  getConversion(
    input: Parameters<typeof getConversion>[1]
  ): ReturnType<typeof getConversion>;
}

export function createConversionService(deps: ServiceDeps): ConversionService {
  return {
    getConversion: (input) => getConversion(deps, input),
  };
}
