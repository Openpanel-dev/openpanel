import { ifNaN } from '@openpanel/common';
import type { IChartEvent, IReportInput } from '@openpanel/validation';
import { last, reverse, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { ch } from '../clickhouse/client';
import { TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
} from './chart.service';
import { onlyReportEvents } from './reports.service';

export class FunnelService {
  constructor(private client: typeof ch) {}

  /**
   * Returns the grouping strategy for the funnel.
   * Note: windowFunnel is ALWAYS computed per session_id first to handle
   * identity changes mid-session (anonymous → logged-in).
   * The returned group is used for the final aggregation step.
   */
  getFunnelGroup(group?: string): 'profile_id' | 'session_id' {
    return group === 'profile_id' ? 'profile_id' : 'session_id';
  }

  getFunnelConditions(events: IChartEvent[] = []): string[] {
    return events.map((event) => {
      const { sb, getWhere } = createSqlBuilder();
      sb.where = getEventFiltersWhereClause(event.filters);
      sb.where.name = `name = ${sqlstring.escape(event.name)}`;
      return getWhere().replace('WHERE ', '');
    });
  }

  /**
   * Builds the session-level funnel CTE.
   * IMPORTANT: windowFunnel is ALWAYS computed per session_id first.
   * This ensures identity changes mid-session (anonymous → logged-in) don't break the funnel.
   * The profile_id is extracted from the last event in the session using argMax.
   */
  buildFunnelCte({
    projectId,
    startDate,
    endDate,
    eventSeries,
    funnelWindowMilliseconds,
    timezone,
    additionalSelects = [],
    additionalGroupBy = [],
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    eventSeries: IChartEvent[];
    funnelWindowMilliseconds: number;
    timezone: string;
    additionalSelects?: string[];
    additionalGroupBy?: string[];
  }) {
    const funnels = this.getFunnelConditions(eventSeries);

    return clix(this.client, timezone)
      .select([
        'session_id',
        `windowFunnel(${funnelWindowMilliseconds}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), ${funnels.join(', ')}) AS level`,
        'argMax(profile_id, created_at) AS profile_id',
        ...additionalSelects,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .where(
        'name',
        'IN',
        eventSeries.map((e) => e.name),
      )
      .groupBy(['session_id', ...additionalGroupBy]);
  }

  buildSessionsCte({
    projectId,
    startDate,
    endDate,
    timezone,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    timezone: string;
  }) {
    return clix(this.client, timezone)
      .select(['profile_id as pid', 'id as sid'])
      .from(TABLE_NAMES.sessions)
      .where('project_id', '=', projectId)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ]);
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
    limit: number | undefined = undefined,
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
        if (limit && Object.keys(acc).length >= limit) {
          return acc;
        }

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

  getProfileFilters(events: IChartEvent[]) {
    return events.flatMap((e) =>
      e.filters
        ?.filter((f) => f.name.startsWith('profile.'))
        .map((f) => f.name.replace('profile.', '')),
    );
  }

  async getFunnel({
    projectId,
    startDate,
    endDate,
    series,
    options,
    breakdowns = [],
    limit,
    timezone = 'UTC',
  }: IReportInput & { timezone: string; events?: IChartEvent[] }) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const funnelOptions = options?.type === 'funnel' ? options : undefined;
    const funnelWindow = funnelOptions?.funnelWindow ?? 24;
    const funnelGroup = funnelOptions?.funnelGroup;

    const eventSeries = onlyReportEvents(series);

    if (eventSeries.length === 0) {
      throw new Error('events are required');
    }

    const funnelWindowSeconds = funnelWindow * 3600;
    const funnelWindowMilliseconds = funnelWindowSeconds * 1000;
    const group = this.getFunnelGroup(funnelGroup);
    const profileFilters = this.getProfileFilters(eventSeries);
    const anyFilterOnProfile = profileFilters.length > 0;
    const anyBreakdownOnProfile = breakdowns.some((b) =>
      b.name.startsWith('profile.'),
    );

    // Create the funnel CTE (session-level)
    const breakdownSelects = breakdowns.map(
      (b, index) => `${getSelectPropertyKey(b.name)} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

    const funnelCte = this.buildFunnelCte({
      projectId,
      startDate,
      endDate,
      eventSeries,
      funnelWindowMilliseconds,
      timezone,
      additionalSelects: breakdownSelects,
      additionalGroupBy: breakdownGroupBy,
    });

    if (anyFilterOnProfile || anyBreakdownOnProfile) {
      // Collect profile columns needed for filters and breakdowns (same as conversion.service)
      const profileFields = new Set<string>(['id']);
      for (const f of profileFilters) {
        profileFields.add(f.split('.')[0]!);
      }
      for (const b of breakdowns.filter((x) => x.name.startsWith('profile.'))) {
        const fieldName = b.name.replace('profile.', '').split('.')[0];
        if (fieldName === 'properties') {
          profileFields.add('properties');
        } else if (['email', 'first_name', 'last_name'].includes(fieldName!)) {
          profileFields.add(fieldName!);
        }
      }
      const profileSelectColumns = Array.from(profileFields).join(', ');
      funnelCte.leftJoin(
        `(SELECT ${profileSelectColumns} FROM ${TABLE_NAMES.profiles} FINAL
          WHERE project_id = ${sqlstring.escape(projectId)}) as profile`,
        'profile.id = events.profile_id',
      );
    }

    // Base funnel query with CTEs
    const funnelQuery = clix(this.client, timezone);
    funnelQuery.with('session_funnel', funnelCte);

    if (group === 'profile_id') {
      // For profile grouping: re-aggregate by profile_id, taking MAX level per profile.
      // This ensures a user who completed the funnel across multiple sessions
      // (or with identity change) is counted correctly.
      const breakdownAggregates =
        breakdowns.length > 0
          ? `, ${breakdowns.map((_, index) => `any(b_${index}) AS b_${index}`).join(', ')}`
          : '';
      funnelQuery.with(
        'funnel',
        `SELECT profile_id, max(level) AS level${breakdownAggregates} FROM (SELECT * FROM session_funnel WHERE level != 0) GROUP BY profile_id`,
      );
    } else {
      // For session grouping: filter out level = 0 inside the CTE
      funnelQuery.with(
        'funnel',
        'SELECT * FROM session_funnel WHERE level != 0',
      );
    }

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
      .groupBy(['level', ...breakdowns.map((b, index) => `b_${index}`)])
      .orderBy('level', 'DESC');

    const funnelData = await funnelQuery.execute();
    const funnelSeries = this.toSeries(funnelData, breakdowns, limit);

    return funnelSeries
      .map((data) => {
        const maxLevel = eventSeries.length;
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
              const event = eventSeries[item.level - 1]!;
              return [
                ...acc,
                {
                  event: {
                    ...event,
                    displayName: event.displayName || event.name,
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
