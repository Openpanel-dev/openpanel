import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { escape } from 'sqlstring';
import {
  TABLE_NAMES,
  chQuery,
  formatClickhouseDate,
} from '../clickhouse-client';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';

interface FunnelStep {
  event: IChartEvent & { displayName: string };
  count: number;
  percent: number;
  dropoffCount: number;
  dropoffPercent: number;
  previousCount: number;
}

interface FunnelResult {
  totalSessions: number;
  steps: FunnelStep[];
}

interface RawFunnelData {
  level: number;
  count: number;
}

interface StepMetrics {
  currentStep: number;
  currentCount: number;
  previousCount: number;
  totalUsers: number;
}

// Main function
export async function getFunnelData({
  projectId,
  startDate,
  endDate,
  ...payload
}: IChartInput): Promise<FunnelResult> {
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required');
  }

  if (payload.events.length === 0) {
    return { totalSessions: 0, steps: [] };
  }

  const funnelWindow = (payload.funnelWindow || 24) * 3600;
  const funnelGroup = payload.funnelGroup || 'session_id';

  const sql = buildFunnelQuery(
    payload.events,
    projectId,
    startDate,
    endDate,
    funnelWindow,
    funnelGroup,
  );

  return await chQuery<RawFunnelData>(sql)
    .then((funnel) => fillFunnel(funnel, payload.events.length))
    .then((funnel) => ({
      totalSessions: funnel[0]?.count ?? 0,
      steps: calculateStepMetrics(
        funnel,
        payload.events,
        funnel[0]?.count ?? 0,
      ),
    }));
}

// Helper functions
function buildFunnelQuery(
  events: IChartEvent[],
  projectId: string,
  startDate: string,
  endDate: string,
  funnelWindow: number,
  funnelGroup: string,
): string {
  const funnelConditions = events.map((event) => {
    const { sb, getWhere } = createSqlBuilder();
    sb.where = getEventFiltersWhereClause(event.filters);
    sb.where.name = `name = ${escape(event.name)}`;
    return getWhere().replace('WHERE ', '');
  });

  const innerSql = `
    SELECT
      sp.${funnelGroup},
      windowFunnel(${funnelWindow}, 'strict_increase')(
        toUnixTimestamp(created_at), 
        ${funnelConditions.join(', ')}
      ) AS level
    FROM ${TABLE_NAMES.events}
    LEFT JOIN (
      SELECT 
          session_id, 
          any(profile_id) AS profile_id
      FROM ${TABLE_NAMES.events}
      WHERE project_id = ${escape(projectId)}
        AND created_at >= '${formatClickhouseDate(startDate)}'
        AND created_at <= '${formatClickhouseDate(endDate)}' 
      GROUP BY session_id
      HAVING profile_id IS NOT NULL
    ) AS sp ON session_id = sp.session_id
    WHERE 
      project_id = ${escape(projectId)} AND 
      created_at >= '${formatClickhouseDate(startDate)}' AND 
      created_at <= '${formatClickhouseDate(endDate)}' AND
      name IN (${events.map((event) => escape(event.name)).join(', ')})
    GROUP BY sp.${funnelGroup}
  `;

  const sql = `
    SELECT 
      level,
      count() AS count 
    FROM (${innerSql}) 
    WHERE level != 0
    GROUP BY level 
    ORDER BY level DESC`;

  return sql;
}

function calculateStepMetrics(
  funnelData: RawFunnelData[],
  events: IChartEvent[],
  totalSessions: number,
): FunnelStep[] {
  return funnelData
    .sort((a, b) => a.level - b.level) // Ensure steps are in order
    .map((data, index, array): FunnelStep => {
      const metrics: StepMetrics = {
        currentStep: data.level,
        currentCount: data.count,
        previousCount: index === 0 ? totalSessions : array[index - 1]!.count,
        totalUsers: totalSessions,
      };

      const event = events[data.level - 1]!;

      return {
        event: {
          ...event,
          displayName: event.displayName ?? event.name,
        },
        count: metrics.currentCount,
        percent: calculatePercent(metrics.currentCount, metrics.totalUsers),
        dropoffCount: calculateDropoff(metrics),
        dropoffPercent: calculateDropoffPercent(metrics),
        previousCount: metrics.previousCount,
      };
    });
}

function calculatePercent(count: number, total: number): number {
  return (count / total) * 100;
}

function calculateDropoff({
  currentCount,
  previousCount,
}: StepMetrics): number {
  return previousCount - currentCount;
}

function calculateDropoffPercent({
  currentCount,
  previousCount,
}: StepMetrics): number {
  return 100 - (currentCount / previousCount) * 100;
}

function fillFunnel(funnel: RawFunnelData[], steps: number): RawFunnelData[] {
  const filled = Array.from({ length: steps }, (_, index) => {
    const level = index + 1;
    const matchingResult = funnel.find((res) => res.level === level);
    return {
      level,
      count: matchingResult ? matchingResult.count : 0,
    };
  });

  // Accumulate counts from top to bottom of the funnel
  for (let i = filled.length - 1; i >= 0; i--) {
    const step = filled[i]!;
    const prevStep = filled[i + 1];
    if (prevStep) {
      step.count += prevStep.count;
    }
  }

  return filled;
}
