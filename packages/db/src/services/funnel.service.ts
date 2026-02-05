import { ifNaN } from '@openpanel/common';
import type {
  IChartEvent,
  IChartEventItem,
  IChartInput,
} from '@openpanel/validation';
import { last, reverse, uniq } from 'ramda';
import sqlstring from 'sqlstring';
import { ch, formatClickhouseDate } from '../clickhouse/client';
import { TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { createSqlBuilder } from '../sql-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
  fetchCohortsMetadata,
  getCohortCteName,
  getCohortAlias,
  buildCohortMembershipQuery,
} from './chart.service';
import { onlyReportEvents } from './reports.service';
import {
  getCustomEventByName,
  expandCustomEventToSQL,
} from './custom-event.service';

export class FunnelService {
  constructor(private client: typeof ch) {}

  /**
   * Build events source for funnel query
   * Handles both regular events and custom events
   */
  private async buildEventsSource(
    events: IChartEvent[],
    projectId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    fromClause: string;
    withClauses: Array<{ name: string; query: any }>;
    needsNameFilter: boolean;
  }> {
    // Check which events are custom events
    const customEventsChecks = await Promise.all(
      events.map((event) => getCustomEventByName(event.name, projectId)),
    );

    const hasCustomEvents = customEventsChecks.some((ce) => ce !== null);

    // If no custom events, use regular events table
    if (!hasCustomEvents) {
      return {
        fromClause: TABLE_NAMES.events,
        withClauses: [],
        needsNameFilter: true,
      };
    }

    // Build CTEs for custom events
    const withClauses: Array<{ name: string; query: any }> = [];
    const baseWhere = [
      `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`,
      `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`,
    ];

    // Build union parts - one for each event (custom or regular)
    const unionParts: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;
      const customEvent = customEventsChecks[i];

      if (customEvent) {
        // Custom event - create CTE and reference it
        const cteName = `custom_event_${i}`;
        const sql = expandCustomEventToSQL(
          {
            name: customEvent.name,
            projectId,
            definition: customEvent.definition as any,
          },
          baseWhere,
        );

        withClauses.push({
          name: cteName,
          query: sql,
        });

        unionParts.push(`SELECT * FROM ${cteName}`);
      } else {
        // Regular event - select directly
        unionParts.push(`
          SELECT * FROM ${TABLE_NAMES.events}
          WHERE project_id = '${projectId}'
            AND name = '${event.name}'
            AND created_at BETWEEN toDateTime('${startDate}') AND toDateTime('${endDate}')
        `);
      }
    }

    // Create combined_events CTE
    withClauses.push({
      name: 'combined_events',
      query: unionParts.join(' UNION ALL '),
    });

    return {
      fromClause: 'combined_events',
      withClauses,
      needsNameFilter: false, // Already filtered in CTEs
    };
  }

  getFunnelGroup(group?: string): [string, string] {
    return group === 'profile_id'
      ? [`COALESCE(nullIf(s.pid, ''), profile_id)`, 'profile_id']
      : ['session_id', 'session_id'];
  }

  getFunnelConditions(events: IChartEvent[] = []): string[] {
    return events.map((event) => {
      const { sb, getWhere } = createSqlBuilder();
      sb.where = getEventFiltersWhereClause(event.filters);
      sb.where.name = `name = ${sqlstring.escape(event.name)}`;
      return getWhere().replace('WHERE ', '');
    });
  }

  buildFunnelCte({
    projectId,
    startDate,
    endDate,
    eventSeries,
    funnelWindowMilliseconds,
    group,
    timezone,
    additionalSelects = [],
    additionalGroupBy = [],
    fromClause,
    needsNameFilter,
  }: {
    projectId: string;
    startDate: string;
    endDate: string;
    eventSeries: IChartEvent[];
    funnelWindowMilliseconds: number;
    group: [string, string];
    timezone: string;
    additionalSelects?: string[];
    additionalGroupBy?: string[];
    fromClause: string;
    needsNameFilter: boolean;
  }) {
    const funnels = this.getFunnelConditions(eventSeries);

    const query = clix(this.client, timezone)
      .select([
        `${group[0]} AS ${group[1]}`,
        ...additionalSelects,
        `windowFunnel(${funnelWindowMilliseconds}, 'strict_increase')(toUInt64(toUnixTimestamp64Milli(created_at)), ${funnels.join(', ')}) AS level`,
      ])
      .from(fromClause, false)
      .where('project_id', '=', projectId)
      .groupBy([group[1], ...additionalGroupBy]);

    // Add date and name filters only for regular events
    if (needsNameFilter) {
      query
        .where('created_at', 'BETWEEN', [
          clix.datetime(startDate, 'toDateTime'),
          clix.datetime(endDate, 'toDateTime'),
        ])
        .where(
          'name',
          'IN',
          eventSeries.map((e) => e.name),
        );
    }

    return query;
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
    funnelWindow = 24,
    funnelGroup,
    breakdowns = [],
    limit,
    timezone = 'UTC',
  }: IChartInput & { timezone: string; events?: IChartEvent[] }) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    const eventSeries = onlyReportEvents(series);

    if (eventSeries.length === 0) {
      throw new Error('events are required');
    }

    // Extract cohort IDs from breakdowns and event filters (deduplicated)
    const cohortIdsSet = new Set<string>();
    breakdowns?.forEach((b) => {
      if (b.cohortId) {
        cohortIdsSet.add(b.cohortId);
      } else if (b.name.startsWith('cohort:')) {
        cohortIdsSet.add(b.name.split(':')[1]!);
      }
    });
    eventSeries.forEach((event) => {
      event.filters?.forEach((filter) => {
        if (filter.cohortId) {
          cohortIdsSet.add(filter.cohortId);
        }
      });
    });

    const cohortIds = Array.from(cohortIdsSet);

    // Fetch cohort metadata from Postgres (always fresh, no cache)
    const cohortMetadata = await fetchCohortsMetadata(cohortIds);

    const funnelWindowSeconds = funnelWindow * 3600;
    const funnelWindowMilliseconds = funnelWindowSeconds * 1000;
    const group = this.getFunnelGroup(funnelGroup);
    const profileFilters = this.getProfileFilters(eventSeries);
    const anyFilterOnProfile = profileFilters.length > 0;
    const anyBreakdownOnProfile = breakdowns.some((b) =>
      b.name.startsWith('profile.'),
    );

    // Get events source (handles custom events)
    const { fromClause, withClauses, needsNameFilter } =
      await this.buildEventsSource(eventSeries, projectId, startDate, endDate);

    // Create the funnel CTE
    const breakdownSelects = breakdowns.map(
      (b, index) => `${getSelectPropertyKey(b.name, projectId)} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

    const funnelCte = this.buildFunnelCte({
      projectId,
      startDate,
      endDate,
      eventSeries,
      funnelWindowMilliseconds,
      group,
      timezone,
      additionalSelects: breakdownSelects,
      additionalGroupBy: breakdownGroupBy,
      fromClause,
      needsNameFilter,
    });

    if (anyFilterOnProfile || anyBreakdownOnProfile) {
      funnelCte.leftJoin(
        `(SELECT id, ${uniq(profileFilters.map((f) => f.split('.')[0]))} FROM ${TABLE_NAMES.profiles} FINAL
          WHERE project_id = ${sqlstring.escape(projectId)}) as profile`,
        'profile.id = events.profile_id',
      );
    }

    // Add LEFT JOINs for all cohorts (much faster than IN subqueries)
    cohortIds.forEach((cohortId) => {
      const cohortAlias = getCohortAlias(cohortId);
      const cohortCte = getCohortCteName(cohortId);
      funnelCte.leftJoin(
        `${cohortCte} AS ${cohortAlias}`,
        `${cohortAlias}.profile_id = events.profile_id`,
      );
    });

    // Create the sessions CTE if needed
    const sessionsCte =
      group[0] !== 'session_id'
        ? this.buildSessionsCte({
            projectId,
            startDate,
            endDate,
            timezone,
          })
        : null;

    // Base funnel query with CTEs
    const funnelQuery = clix(this.client, timezone);

    // Add custom event CTEs first (if any)
    for (const withClause of withClauses) {
      funnelQuery.with(withClause.name, withClause.query);
    }

    // Add cohort CTEs (computed once per query, not per row)
    cohortIds.forEach((cohortId) => {
      const cohortMeta = cohortMetadata.get(cohortId);
      const cohortQuery = buildCohortMembershipQuery(cohortId, projectId, cohortMeta);
      funnelQuery.with(getCohortCteName(cohortId), cohortQuery);
    });

    if (sessionsCte) {
      funnelCte.leftJoin('sessions s', 's.sid = events.session_id');
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
