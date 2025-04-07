import { ifNaN } from '@openpanel/common';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { last, reverse } from 'ramda';
import { escape } from 'sqlstring';
import { ch } from '../clickhouse/client';
import { TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
} from './chart.service';

export class FunnelService {
  constructor(private client: typeof ch) {}

  private getFunnelGroup(group?: string) {
    return group === 'profile_id'
      ? [`COALESCE(nullIf(s.profile_id, ''), profile_id)`, 'profile_id']
      : ['session_id', 'session_id'];
  }

  private getFunnelConditions(events: IChartEvent[]) {
    return events.map((event) => {
      const { sb, getWhere } = createSqlBuilder();
      sb.where = getEventFiltersWhereClause(event.filters);
      sb.where.name = `name = ${escape(event.name)}`;
      return getWhere().replace('WHERE ', '');
    });
  }

  private fillFunnel(
    funnel: { level: number; count: number }[],
    steps: number,
  ) {
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
      const step = filled[i];
      const prevStep = filled[i + 1];
      // If there's a previous step, add the count to the current step
      if (step && prevStep) {
        step.count += prevStep.count;
      }
    }
    return filled.reverse();
  }

  toSeries(
    funnel: { level: number; count: number; [key: string]: any }[],
    breakdowns: { name: string }[] = [],
  ) {
    if (!breakdowns.length) {
      return [
        funnel.map((f) => ({
          level: f.level,
          count: f.count,
          id: 'none',
          breakdowns: [],
        })),
      ];
    }

    // Group by breakdown values
    const series = funnel.reduce(
      (acc, f) => {
        const key = breakdowns.map((b, index) => f[`b_${index}`]).join('|');
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key]!.push({
          id: key,
          breakdowns: breakdowns.map((b, index) => f[`b_${index}`]),
          level: f.level,
          count: f.count,
        });
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          breakdowns: string[];
          level: number;
          count: number;
        }[]
      >,
    );

    return Object.values(series);
  }

  async getFunnel({
    projectId,
    startDate,
    endDate,
    events,
    funnelWindow = 24,
    funnelGroup,
    breakdowns = [],
  }: IChartInput) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    if (events.length === 0) {
      throw new Error('events are required');
    }

    const funnelWindowSeconds = funnelWindow * 3600;
    const group = this.getFunnelGroup(funnelGroup);
    const funnels = this.getFunnelConditions(events);

    // Create the funnel CTE
    const funnelCte = clix(this.client)
      .select([
        `${group[0]} AS ${group[1]}`,
        ...breakdowns.map(
          (b, index) => `${getSelectPropertyKey(b.name)} as b_${index}`,
        ),
        `windowFunnel(${funnelWindowSeconds}, 'strict_increase')(toUnixTimestamp(created_at), ${funnels.join(', ')}) AS level`,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate),
        clix.datetime(endDate),
      ])
      .where(
        'name',
        'IN',
        events.map((e) => e.name),
      )
      .groupBy([group[1], ...breakdowns.map((b, index) => `b_${index}`)]);

    // Create the sessions CTE if needed
    const sessionsCte =
      group[0] !== 'session_id'
        ? clix(this.client)
            .select(['profile_id', 'id'])
            .from(TABLE_NAMES.sessions)
            .where('project_id', '=', projectId)
            .where('created_at', 'BETWEEN', [
              clix.datetime(startDate),
              clix.datetime(endDate),
            ])
        : null;

    // Base funnel query with CTEs
    const funnelQuery = clix(this.client);

    if (sessionsCte) {
      funnelCte.leftJoin('sessions s', 's.id = session_id');
      funnelQuery.with('sessions', sessionsCte);
    }

    funnelQuery.with('funnel', funnelCte);

    funnelQuery
      .select<{
        level: number;
        count: number;
        [key: string]: any;
      }>([
        'level',
        ...breakdowns.map((b, index) => `b_${index}`),
        'count() as count',
      ])
      .from('funnel')
      .where('level', '!=', 0)
      .groupBy(['level', ...breakdowns.map((b, index) => `b_${index}`)])
      .orderBy('level', 'DESC');

    const funnelData = await funnelQuery.execute();
    const funnelSeries = this.toSeries(funnelData, breakdowns);

    return funnelSeries
      .map((data) => {
        const maxLevel = events.length;
        const filledFunnelRes = this.fillFunnel(
          data.map((d) => ({ level: d.level, count: d.count })),
          maxLevel,
        );

        const totalSessions = last(filledFunnelRes)?.count ?? 0;
        const steps = reverse(filledFunnelRes)
          .reduce(
            (acc, item, index, list) => {
              const prev = list[index - 1] ?? { count: totalSessions };
              const next = list[index + 1];
              const event = events[item.level - 1]!;
              return [
                ...acc,
                {
                  event: {
                    ...event,
                    displayName: event.displayName ?? event.name,
                  },
                  count: item.count,
                  percent: (item.count / totalSessions) * 100,
                  dropoffCount: next ? item.count - next.count : null,
                  dropoffPercent: next
                    ? ((item.count - next.count) / item.count) * 100
                    : null,
                  previousCount: prev.count,
                  nextCount: next?.count ?? null,
                },
              ];
            },
            [] as {
              event: IChartEvent & { displayName: string };
              count: number;
              percent: number;
              dropoffCount: number | null;
              dropoffPercent: number | null;
              previousCount: number;
              nextCount: number | null;
            }[],
          )
          .map((step, index, list) => {
            return {
              ...step,
              percent: ifNaN(step.percent, 0),
              dropoffPercent: ifNaN(step.dropoffPercent, 0),
              isHighestDropoff: (() => {
                // Skip if current step has no dropoff
                if (!step?.dropoffCount) return false;

                // Get maximum dropoff count, excluding 0s
                const maxDropoff = Math.max(
                  ...list
                    .map((s) => s.dropoffCount || 0)
                    .filter((count) => count > 0),
                );

                // Check if this is the first step with the highest dropoff
                return (
                  step.dropoffCount === maxDropoff &&
                  list.findIndex((s) => s.dropoffCount === maxDropoff) === index
                );
              })(),
            };
          });

        return {
          id: data[0]?.id ?? 'none',
          breakdowns: data[0]?.breakdowns ?? [],
          steps,
          totalSessions,
          lastStep: last(steps)!,
          mostDropoffsStep: steps.find((step) => step.isHighestDropoff)!,
        };
      })
      .sort((a, b) => {
        const aTotal = a.steps.reduce((acc, step) => acc + step.count, 0);
        const bTotal = b.steps.reduce((acc, step) => acc + step.count, 0);
        return bTotal - aTotal;
      });
  }
}

export const funnelService = new FunnelService(ch);
