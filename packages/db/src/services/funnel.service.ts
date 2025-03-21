import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { last, reverse } from 'ramda';
import { escape } from 'sqlstring';
import { ch } from '../clickhouse/client';
import { TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import { getEventFiltersWhereClause } from './chart.service';

export class FunnelService {
  constructor(private client: typeof ch) {}

  private getFunnelGroup(group?: string) {
    return group === 'profile_id'
      ? [`COALESCE(nullIf(s.profile_id, ''), e.profile_id)`, 'profile_id']
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
        const key = breakdowns.map((b) => f[b.name]).join('|');
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key]!.push({
          id: key,
          breakdowns: breakdowns.map((b) => f[b.name]),
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

  async getFunnelData({
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
        ...breakdowns.map((b) => `${b.name} as ${b.name}`),
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
      .groupBy([group[1], ...breakdowns.map((b) => b.name)]);

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
    const funnelQuery = clix(this.client).with('funnel', funnelCte);

    if (sessionsCte) {
      funnelQuery.with('sessions', sessionsCte);
    }

    funnelQuery
      .select<{
        level: number;
        count: number;
        [key: string]: any;
      }>(['level', ...breakdowns.map((b) => b.name), 'count() as count'])
      .from('funnel')
      .where('level', '!=', 0)
      .groupBy(['level', ...breakdowns.map((b) => b.name)])
      .orderBy('level', 'DESC');

    const funnelData = await funnelQuery.execute();
    console.log('funnelData', funnelData);
    const funnelSeries = this.toSeries(funnelData, breakdowns);
    console.log('funnelSeries', funnelSeries);

    return funnelSeries.map((data) => {
      const maxLevel = events.length;
      const filledFunnelRes = this.fillFunnel(
        data.map((d) => ({ level: d.level, count: d.count })),
        maxLevel,
      );

      const totalSessions = last(filledFunnelRes)?.count ?? 0;
      const steps = reverse(filledFunnelRes).reduce(
        (acc, item, index, list) => {
          const prev = list[index - 1] ?? { count: totalSessions };
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
              dropoffCount: prev.count - item.count,
              dropoffPercent: 100 - (item.count / prev.count) * 100,
              previousCount: prev.count,
            },
          ];
        },
        [] as {
          event: IChartEvent & { displayName: string };
          count: number;
          percent: number;
          dropoffCount: number;
          dropoffPercent: number;
          previousCount: number;
        }[],
      );

      return {
        id: data[0]?.id ?? 'none',
        breakdowns: data[0]?.breakdowns ?? [],
        steps,
        totalSessions,
      };
    });
  }
}

export const funnelService = new FunnelService(ch);
