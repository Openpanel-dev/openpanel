import { NOT_SET_VALUE } from '@openpanel/constants';
import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { omit } from 'ramda';
import { TABLE_NAMES, ch, formatClickhouseDate } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import {
  getEventFiltersWhereClause,
  getSelectPropertyKey,
  fetchCohortsMetadata,
  getCohortCteName,
  getCohortAlias,
  buildCohortMembershipQuery,
} from './chart.service';
import { onlyReportEvents } from './reports.service';
import { getCustomEventByName, expandCustomEventToSQL } from './custom-event.service';

export class ConversionService {
  constructor(private client: typeof ch) {}

  /**
   * Build events source for conversion query
   * Handles both regular events and custom events
   * Supports N events (not just 2)
   */
  private async buildEventsSource(
    events: IChartEvent[],
    projectId: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    fromClause: string;
    ctes: string[];
    needsDateFilter: boolean;
  }> {
    // Check if any events are custom events
    const customEvents = await Promise.all(
      events.map(event => getCustomEventByName(event.name, projectId))
    );

    // If no custom events, use regular events table
    if (customEvents.every(ce => !ce)) {
      return {
        fromClause: TABLE_NAMES.events,
        ctes: [],
        needsDateFilter: true,
      };
    }

    // Build CTEs for custom events
    const ctes: string[] = [];
    const baseWhere = [
      `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`,
      `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`,
    ];

    // Build CTE for each custom event
    customEvents.forEach((customEvent, index) => {
      if (customEvent) {
        const sql = expandCustomEventToSQL(
          {
            name: customEvent.name,
            projectId,
            definition: customEvent.definition as any,
          },
          baseWhere,
        );
        ctes.push(`custom_event_${index} AS (${sql})`);
      }
    });

    // Build union of custom and regular events
    const unionParts: string[] = [];

    events.forEach((event, index) => {
      if (customEvents[index]) {
        unionParts.push(`SELECT * FROM custom_event_${index}`);
      } else {
        unionParts.push(`
          SELECT * FROM ${TABLE_NAMES.events}
          WHERE project_id = '${projectId}'
            AND name = '${event.name}'
            AND created_at BETWEEN toDateTime('${startDate}') AND toDateTime('${endDate}')
        `);
      }
    });

    ctes.push(`combined_events AS (${unionParts.join(' UNION ALL ')})`);

    return {
      fromClause: 'combined_events',
      ctes,
      needsDateFilter: false, // Already filtered in CTEs
    };
  }

  async getConversion({
    projectId,
    startDate,
    endDate,
    funnelGroup,
    funnelWindow = 24,
    series,
    breakdowns = [],
    limit,
    interval,
    timezone,
  }: Omit<IChartInput, 'range' | 'previous' | 'metric' | 'chartType'> & {
    timezone: string;
  }) {
    const events = onlyReportEvents(series);

    if (events.length < 2) {
      throw new Error('events must be at least 2 events');
    }

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
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
    events.forEach((event) => {
      event.filters?.forEach((filter) => {
        if (filter.cohortId) {
          cohortIdsSet.add(filter.cohortId);
        }
      });
    });

    const cohortIds = Array.from(cohortIdsSet);

    // Fetch cohort metadata from Postgres (always fresh, no cache)
    const cohortMetadata = await fetchCohortsMetadata(cohortIds);

    const group = funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';
    const breakdownColumns = breakdowns.map(
      (b, index) => `${getSelectPropertyKey(b.name, projectId)} as b_${index}`,
    );
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

    const funnelWindowSeconds = funnelWindow * 3600;

    // Get events source (handles custom events)
    const { fromClause, ctes, needsDateFilter } = await this.buildEventsSource(
      events,
      projectId,
      startDate,
      endDate,
    );

    // Build funnel conditions for all events
    const conditions = events.map(event => {
      const where = Object.values(
        getEventFiltersWhereClause(event.filters),
      ).join(' AND ');

      return where
        ? `(name = '${event.name}' AND ${where})`
        : `name = '${event.name}'`;
    });

    // Build WHERE clause
    const whereClauses = [`project_id = '${projectId}'`];
    if (needsDateFilter) {
      whereClauses.push(
        `created_at BETWEEN toDateTime('${startDate}') AND toDateTime('${endDate}')`,
      );
      const eventNames = events.map(e => `'${e.name}'`).join(', ');
      whereClauses.push(`name IN (${eventNames})`);
    }

    // Add cohort CTEs (computed once per query, not per row)
    cohortIds.forEach((cohortId) => {
      const cohortMeta = cohortMetadata.get(cohortId);
      const cohortQuery = buildCohortMembershipQuery(cohortId, projectId, cohortMeta);
      ctes.push(`${getCohortCteName(cohortId)} AS (${cohortQuery})`);
    });

    // Build WITH clause if CTEs exist
    const withClause = ctes.length > 0 ? `WITH ${ctes.join(', ')} ` : '';

    // Build LEFT JOINs for all cohorts (much faster than IN subqueries)
    const cohortJoins = cohortIds.map((cohortId) => {
      const cohortAlias = getCohortAlias(cohortId);
      const cohortCte = getCohortCteName(cohortId);
      return `LEFT ANY JOIN ${cohortCte} AS ${cohortAlias} ON ${cohortAlias}.profile_id = ${fromClause}.profile_id`;
    }).join('\n        ');

    // Final step is the total number of events
    const finalStep = events.length;

    // Build windowFunnel query
    const query = clix(this.client, timezone)
      .select<{
        event_day: string;
        total_first: number;
        conversions: number;
        conversion_rate_percentage: number;
        [key: string]: string | number;
      }>([
        'event_day',
        ...breakdownGroupBy,
        `uniqExact(${group}) AS total_first`,
        `countIf(steps >= ${finalStep}) AS conversions`,
        `round(100.0 * countIf(steps >= ${finalStep}) / uniqExact(${group}), 2) AS conversion_rate_percentage`,
      ])
      .from(
        clix.exp(`
        (${withClause}SELECT
          ${group},
          any(${clix.toStartOf('created_at', interval)}) as event_day,
          ${breakdownColumns.length ? `${breakdownColumns.join(', ')},` : ''}
          windowFunnel(${funnelWindowSeconds})(
            toDateTime(created_at),
            ${conditions.join(',\n            ')}
          ) as steps
        FROM ${fromClause}
        ${cohortJoins}
        WHERE ${whereClauses.join(' AND ')}
        GROUP BY ${group}${breakdownGroupBy.length ? `, ${breakdownGroupBy.join(', ')}` : ''})
      `),
      )
      .where('steps', '>', 0)
      .groupBy(['event_day', ...breakdownGroupBy]);

    for (const order of ['event_day', ...breakdownGroupBy]) {
      query.orderBy(order);
    }

    const results = await query.execute();
    return this.toSeries(results, breakdowns, limit).map(
      (serie, serieIndex) => {
        return {
          ...serie,
          data: serie.data.map((d, index) => ({
            ...d,
            timestamp: new Date(d.date).getTime(),
            serieIndex,
            index,
            serie: omit(['data'], serie),
          })),
        };
      },
    );
  }

  private toSeries(
    data: {
      event_day: string;
      total_first: number;
      conversions: number;
      conversion_rate_percentage: number;
      [key: string]: string | number;
    }[],
    breakdowns: { name: string }[] = [],
    limit: number | undefined = undefined,
  ) {
    if (!breakdowns.length) {
      return [
        {
          id: 'conversion',
          breakdowns: [],
          data: data.map((d) => ({
            date: d.event_day,
            total: d.total_first,
            conversions: d.conversions,
            rate: d.conversion_rate_percentage,
          })),
        },
      ];
    }

    // Group by breakdown values
    const series = data.reduce(
      (acc, d) => {
        if (limit && Object.keys(acc).length >= limit) {
          return acc;
        }

        const key =
          breakdowns.map((b, index) => d[`b_${index}`]).join('|') ||
          NOT_SET_VALUE;
        if (!acc[key]) {
          acc[key] = {
            id: key,
            breakdowns: breakdowns.map(
              (b, index) => (d[`b_${index}`] || NOT_SET_VALUE) as string,
            ),
            data: [],
          };
        }
        acc[key]!.data.push({
          date: d.event_day,
          total: d.total_first,
          conversions: d.conversions,
          rate: d.conversion_rate_percentage,
        });
        return acc;
      },
      {} as Record<
        string,
        {
          id: string;
          breakdowns: string[];
          data: {
            date: string;
            total: number;
            conversions: number;
            rate: number;
          }[];
        }
      >,
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
}

export const conversionService = new ConversionService(ch);
