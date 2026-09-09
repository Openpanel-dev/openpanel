// Ported from packages/db/src/services/funnel.service.ts (M7-004). Every
// ClickHouse statement is a `sql` fragment from src/funnel.sql.ts, proven
// byte-equivalent to V1 in src/funnel.sql.proof.md; V1's funnel.service is a
// re-export shim onto this module (DELEGATE PATTERN).

import { last, reverse } from 'ramda';
import type { ServiceDeps, Services } from '../../services';
import { ifNaN } from '../../shared/math';
import { getSettingsForProject } from '../organization/organization.service';
import type {
  IChartBreakdown,
  IChartEvent,
  IReportInput,
} from '../report/report.constants';
import { mergeGlobalFilters, onlyReportEvents } from '../report/src/series';
import { fetchCohortsMetadata } from './src/chart-statement';
import { collectBreakdownCohortIds } from './src/field-resolution';
import {
  EMPTY_BREAKDOWN_LABEL,
  type FunnelBase,
  type FunnelGroup,
  type FunnelProfilesInput,
  funnelBase,
  funnelChartQuery,
  funnelProfilesQuery,
  funnelSessionsQuery,
  knownFunnelBreakdowns,
} from './src/funnel.sql';
import { runQuery } from './src/run-query';

export {
  EMPTY_BREAKDOWN_LABEL,
  type FunnelBase,
  type FunnelProfilesInput,
  funnelProfilesQuery,
} from './src/funnel.sql';

/** Default funnel window, in hours, when the report does not set one. */
const DEFAULT_FUNNEL_WINDOW_HOURS = 24;
const MILLISECONDS_PER_HOUR = 3600 * 1000;
const PERCENT = 100;
const ROUND_TO_TWO_DECIMALS = 100;
const ROUND_RATE_TO_TWO_DECIMALS = 10_000;

export interface FunnelStep {
  event: IChartEvent & { displayName: string };
  count: number;
  percent: number;
  dropoffCount: number | null;
  dropoffPercent: number | null;
  previousCount: number;
  nextCount: number | null;
  isHighestDropoff: boolean;
}

interface FunnelRow {
  level: number;
  count: number;
  [key: string]: string | number;
}

interface FunnelSerieRow {
  id: string;
  breakdowns: string[];
  level: number;
  count: number;
}

function normalizeBreakdownValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY_BREAKDOWN_LABEL;
  }
  const text = String(value).trim();
  return text === '' ? EMPTY_BREAKDOWN_LABEL : text;
}

/**
 * Returns the grouping strategy for the funnel: whether windowFunnel is
 * computed per session_id or per profile_id. profile_id correctly handles
 * cross-session funnel completions.
 */
export function getFunnelGroup(group?: string): FunnelGroup {
  return group === 'profile_id' ? 'profile_id' : 'session_id';
}

export interface BuildFunnelBaseInput {
  projectId: string;
  startDate: string;
  endDate: string;
  series: IReportInput['series'];
  globalFilters?: IReportInput['globalFilters'];
  breakdowns?: IChartBreakdown[];
  funnelWindow?: number;
  funnelGroup?: string;
  timezone: string;
}

/**
 * Everything the funnel chart and the funnel profile list share: the
 * normalized event series and breakdowns, and the `session_funnel` / `funnel`
 * CTEs with all of their joins wired up. Callers add their own projection.
 */
export async function buildFunnelBase(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    series,
    globalFilters,
    breakdowns: initialBreakdowns = [],
    funnelWindow = DEFAULT_FUNNEL_WINDOW_HOURS,
    funnelGroup,
    timezone,
  }: BuildFunnelBaseInput
): Promise<FunnelBase> {
  const breakdowns = knownFunnelBreakdowns(initialBreakdowns);
  const eventSeries = onlyReportEvents(
    mergeGlobalFilters(series, globalFilters)
  );
  const cohortMetadata = await fetchCohortsMetadata(
    deps,
    collectBreakdownCohortIds(breakdowns)
  );

  return funnelBase({
    projectId,
    startDate,
    endDate,
    eventSeries,
    breakdowns,
    funnelWindowMilliseconds: funnelWindow * MILLISECONDS_PER_HOUR,
    group: getFunnelGroup(funnelGroup),
    funnelGroup,
    cohortMetadata,
    timezone,
    config: deps.config,
  });
}

export function buildSessionsCte(input: {
  projectId: string;
  startDate: string;
  endDate: string;
}) {
  return funnelSessionsQuery(input);
}

function fillFunnel(funnel: { level: number; count: number }[], steps: number) {
  const filled = Array.from({ length: steps }, (_, index) => {
    const level = index + 1;
    const matchingResult = funnel.find((result) => result.level === level);
    return {
      level,
      count: matchingResult ? matchingResult.count : 0,
    };
  });

  // Accumulate counts from the bottom of the funnel upwards.
  for (let index = filled.length - 1; index >= 0; index--) {
    const step = filled[index];
    const nextStep = filled[index + 1];
    if (step && nextStep) {
      step.count += nextStep.count;
    }
  }
  return filled.reverse();
}

export function toSeries(
  funnel: FunnelRow[],
  breakdowns: { name: string }[] = [],
  limit: number | undefined = undefined
): FunnelSerieRow[][] {
  if (breakdowns.length === 0) {
    return [
      funnel.map((row) => ({
        level: row.level,
        count: row.count,
        id: 'none',
        breakdowns: [],
      })),
    ];
  }

  // Group by breakdown values (normalize empty/null to "Not set").
  const series = funnel.reduce(
    (acc, row) => {
      if (limit && Object.keys(acc).length >= limit) {
        return acc;
      }

      const key = breakdowns
        .map((_, index) => normalizeBreakdownValue(row[`b_${index}`]))
        .join('|');
      if (!acc[key]) {
        acc[key] = [];
      }
      (acc[key] as FunnelSerieRow[]).push({
        id: key,
        breakdowns: breakdowns.map((_, index) =>
          normalizeBreakdownValue(row[`b_${index}`])
        ),
        level: row.level,
        count: row.count,
      });
      return acc;
    },
    {} as Record<string, FunnelSerieRow[]>
  );

  return Object.values(series);
}

function isHighestDropoff(
  step: { dropoffCount: number | null },
  index: number,
  list: { dropoffCount: number | null }[]
): boolean {
  if (!step?.dropoffCount) {
    return false;
  }
  const maxDropoff = Math.max(
    ...list.map((item) => item.dropoffCount || 0).filter((count) => count > 0)
  );
  return (
    step.dropoffCount === maxDropoff &&
    list.findIndex((item) => item.dropoffCount === maxDropoff) === index
  );
}

function toFunnelSteps(
  data: FunnelSerieRow[],
  eventSeries: IChartEvent[]
): { steps: FunnelStep[]; totalSessions: number } {
  const filledFunnel = fillFunnel(
    data.map((row) => ({ level: row.level, count: row.count })),
    eventSeries.length
  );
  const totalSessions = last(filledFunnel)?.count ?? 0;

  const steps = reverse(filledFunnel)
    .reduce(
      (acc, item, index, list) => {
        const previous = list[index - 1] ?? { count: totalSessions };
        const next = list[index + 1];
        const event = eventSeries[item.level - 1] as IChartEvent;
        acc.push({
          event: {
            ...event,
            displayName: event.displayName || event.name,
          },
          count: item.count,
          percent: (item.count / totalSessions) * PERCENT,
          dropoffCount: next ? item.count - next.count : null,
          dropoffPercent: next
            ? ((item.count - next.count) / item.count) * PERCENT
            : null,
          previousCount: previous.count,
          nextCount: next?.count ?? null,
        });
        return acc;
      },
      [] as Omit<FunnelStep, 'isHighestDropoff'>[]
    )
    .map((step, index, list) => ({
      ...step,
      percent: ifNaN(step.percent, 0),
      dropoffPercent: ifNaN(step.dropoffPercent, 0),
      isHighestDropoff: isHighestDropoff(step, index, list),
    }));

  return { steps, totalSessions };
}

export async function getFunnel(
  deps: ServiceDeps,
  {
    projectId,
    startDate,
    endDate,
    series,
    globalFilters,
    options,
    breakdowns: initialBreakdowns = [],
    limit,
    timezone = 'UTC',
  }: IReportInput & { timezone: string; events?: IChartEvent[] }
) {
  if (!(startDate && endDate)) {
    throw new Error('startDate and endDate are required');
  }

  const funnelOptions = options?.type === 'funnel' ? options : undefined;
  const base = await buildFunnelBase(deps, {
    projectId,
    startDate,
    endDate,
    series,
    globalFilters,
    breakdowns: initialBreakdowns,
    funnelWindow: funnelOptions?.funnelWindow,
    funnelGroup: funnelOptions?.funnelGroup,
    timezone,
  });

  const funnelData = await runQuery<FunnelRow>(
    deps,
    funnelChartQuery(base),
    base.timezone
  );

  return toSeries(funnelData, base.breakdowns, limit)
    .map((data) => {
      const { steps, totalSessions } = toFunnelSteps(data, base.eventSeries);
      return {
        id: data[0]?.id ?? 'none',
        breakdowns: data[0]?.breakdowns ?? [],
        steps,
        totalSessions,
        lastStep: last(steps) as FunnelStep,
        mostDropoffsStep: steps.find(
          (step) => step.isHighestDropoff
        ) as FunnelStep,
      };
    })
    .sort((a, b) => {
      const aTotal = a.steps.reduce((acc, step) => acc + step.count, 0);
      const bTotal = b.steps.reduce((acc, step) => acc + step.count, 0);
      return bTotal - aTotal;
    });
}

export async function getFunnelCore(
  deps: ServiceDeps,
  input: {
    projectId: string;
    startDate: string;
    endDate: string;
    steps: string[];
    windowHours?: number;
    groupBy?: FunnelGroup;
  }
) {
  const { timezone } = await getSettingsForProject(deps, input.projectId);
  const eventSeries = input.steps.map((name, index) => ({
    id: String(index + 1),
    type: 'event' as const,
    name,
    displayName: name,
    segment: 'user' as const,
    filters: [],
  }));

  const result = await getFunnel(deps, {
    projectId: input.projectId,
    startDate: input.startDate,
    endDate: input.endDate,
    series: eventSeries,
    breakdowns: [],
    chartType: 'funnel',
    interval: 'day',
    range: 'custom',
    previous: false,
    metric: 'sum',
    options: {
      type: 'funnel',
      funnelWindow: input.windowHours ?? DEFAULT_FUNNEL_WINDOW_HOURS,
      funnelGroup: input.groupBy ?? 'session_id',
    },
    timezone,
  });

  const primarySeries = result[0];
  if (!primarySeries) {
    return {
      steps: [],
      totalUsers: 0,
      completedUsers: 0,
      overallConversionRate: 0,
    };
  }

  const steps = primarySeries.steps.map((step, index) => ({
    step: index + 1,
    eventName: step.event.displayName || step.event.name,
    users: step.count,
    conversionRateFromStart:
      Math.round(step.percent * ROUND_TO_TWO_DECIMALS) / ROUND_TO_TWO_DECIMALS,
    dropoffPercent:
      step.dropoffPercent === null
        ? null
        : Math.round(step.dropoffPercent * ROUND_TO_TWO_DECIMALS) /
          ROUND_TO_TWO_DECIMALS,
    isHighestDropoff: step.isHighestDropoff,
  }));

  const totalUsers = steps[0]?.users ?? 0;
  const completedUsers = steps.at(-1)?.users ?? 0;

  return {
    steps,
    totalUsers,
    completedUsers,
    overallConversionRate:
      totalUsers > 0
        ? Math.round(
            (completedUsers / totalUsers) * ROUND_RATE_TO_TWO_DECIMALS
          ) / ROUND_TO_TWO_DECIMALS
        : 0,
  };
}

export async function getFunnelProfileIds(
  deps: ServiceDeps,
  input: BuildFunnelBaseInput &
    Omit<FunnelProfilesInput, 'breakdownValues'> & {
      breakdownValues: (string | undefined)[];
    }
): Promise<string[]> {
  const base = await buildFunnelBase(deps, input);
  const rows = await runQuery<{ profile_id: string }>(
    deps,
    funnelProfilesQuery(base, {
      targetLevel: input.targetLevel,
      showDropoffs: input.showDropoffs,
      breakdownValues: input.breakdownValues,
      limit: input.limit,
    }),
    base.timezone
  );
  return rows.map((row) => row.profile_id).filter(Boolean);
}

/**
 * `ctx.services.chart`'s funnel half, as its own module factory (ADR-007:
 * "each service is `createXService(deps)`"). `createChartService` composes
 * this rather than re-binding these functions itself, so the chart module
 * keeps one registry key while every `*.service.ts` file exposes its own
 * factory (M10-009).
 */
export function createFunnelService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    getFunnelGroup,
    toSeries,
    buildSessionsCte,
    getFunnel: (
      input: Parameters<typeof getFunnel>[1]
    ): ReturnType<typeof getFunnel> => getFunnel(deps, input),
    getFunnelCore: (
      input: Parameters<typeof getFunnelCore>[1]
    ): ReturnType<typeof getFunnelCore> => getFunnelCore(deps, input),
    buildFunnelBase: (
      input: Parameters<typeof buildFunnelBase>[1]
    ): ReturnType<typeof buildFunnelBase> => buildFunnelBase(deps, input),
    getFunnelProfileIds: (
      input: Parameters<typeof getFunnelProfileIds>[1]
    ): ReturnType<typeof getFunnelProfileIds> =>
      getFunnelProfileIds(deps, input),
  };
}
