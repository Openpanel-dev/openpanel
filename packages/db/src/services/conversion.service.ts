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
  getMaterializedColumns,
} from './chart.service';
import { onlyReportEvents } from './reports.service';
import { getCustomEventByName, expandCustomEventToSQL } from './custom-event.service';

export class ConversionService {
  constructor(private client: typeof ch) {}

  /**
   * Helper to build breakdown column with table alias
   * Handles property keys, profile fields, and cohort expressions
   */
  private getBreakdownColumnWithAlias(
    breakdownName: string,
    projectId: string,
    cohortId: string | undefined,
    tableAlias: string,
  ): string {
    const propertyKey = getSelectPropertyKey(breakdownName, projectId, cohortId);

    // Cohort expressions already have their own aliases (e.g., cohort_abc123.profile_id)
    if (propertyKey.includes('cohort_') || propertyKey.startsWith('if(')) {
      return propertyKey;
    }

    // Profile fields are already qualified (e.g., profile.created_at)
    if (propertyKey.startsWith('profile.')) {
      return propertyKey;
    }

    // For property fields, prepend table alias
    // e.g., properties['key'] -> se.properties['key']
    if (propertyKey.startsWith('properties[') || propertyKey.includes('arrayMap')) {
      return `${tableAlias}.${propertyKey}`;
    }

    // For simple fields (e.g., name, country), prepend alias
    return `${tableAlias}.${propertyKey}`;
  }

  /**
   * Build CTE for a single event (start or end of funnel)
   * Handles both regular events and custom events
   */
  private async buildSingleEventCte(
    event: IChartEvent,
    cteName: string,
    projectId: string,
    startDate: string,
    endDate: string,
  ): Promise<string> {
    // Get materialized columns to ensure compatibility
    const materializedColumns = await getMaterializedColumns();
    const materializedColumnNames = Object.values(materializedColumns);
    const materializedColumnsSelect = materializedColumnNames.length > 0
      ? `, ${materializedColumnNames.join(', ')}`
      : '';

    // Check if this is a custom event
    const customEvent = await getCustomEventByName(event.name, projectId);

    if (customEvent) {
      // Custom event - expand to SQL
      const baseWhere = [
        `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`,
        `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`,
      ];

      const sql = await expandCustomEventToSQL(
        {
          name: customEvent.name,
          projectId,
          definition: customEvent.definition as any,
        },
        baseWhere,
      );

      return `${cteName} AS (${sql})`;
    } else {
      // Regular event - apply filters if present
      const filterWhere = event.filters && event.filters.length > 0
        ? ' AND ' + Object.values(getEventFiltersWhereClause(event.filters, projectId)).join(' AND ')
        : '';

      return `${cteName} AS (
        SELECT *${materializedColumnsSelect}
        FROM ${TABLE_NAMES.events}
        WHERE project_id = '${projectId}'
          AND name = '${event.name}'
          AND created_at >= toDateTime('${formatClickhouseDate(startDate)}')
          AND created_at <= toDateTime('${formatClickhouseDate(endDate)}')${filterWhere}
      )`;
    }
  }

  /**
   * Build events source for conversion query
   * Handles both regular events and custom events
   * Supports N events (not just 2)
   * @deprecated Use buildSingleEventCte instead for optimized self-join approach
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

    // Get materialized columns to ensure UNION compatibility
    const materializedColumns = await getMaterializedColumns();
    const materializedColumnNames = Object.values(materializedColumns);
    const materializedColumnsSelect = materializedColumnNames.length > 0
      ? `, ${materializedColumnNames.join(', ')}`
      : '';

    // Build CTEs for custom events
    const ctes: string[] = [];
    const baseWhere = [
      `created_at >= toDateTime('${formatClickhouseDate(startDate)}')`,
      `created_at <= toDateTime('${formatClickhouseDate(endDate)}')`,
    ];

    // Build CTE for each custom event
    const customEventQueries = await Promise.all(
      customEvents.map(async (customEvent, index) => {
        if (customEvent) {
          const sql = await expandCustomEventToSQL(
            {
              name: customEvent.name,
              projectId,
              definition: customEvent.definition as any,
            },
            baseWhere,
          );
          return `custom_event_${index} AS (${sql})`;
        }
        return null;
      })
    );

    ctes.push(...customEventQueries.filter((q): q is string => q !== null));

    // Build union of custom and regular events
    const unionParts: string[] = [];

    events.forEach((event, index) => {
      if (customEvents[index]) {
        unionParts.push(`SELECT * FROM custom_event_${index}`);
      } else {
        // Regular event - include materialized columns to match custom events
        unionParts.push(`
          SELECT *${materializedColumnsSelect} FROM ${TABLE_NAMES.events}
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

    const funnelWindowSeconds = funnelWindow * 3600;

    // Use first and last events for conversion tracking
    const firstEvent = events[0]!;
    const lastEvent = events[events.length - 1]!;

    // Calculate extended end date for conversion events (add funnel window)
    const extendedEndDate = DateTime.fromISO(endDate)
      .plus({ seconds: funnelWindowSeconds })
      .toFormat('yyyy-MM-dd HH:mm:ss');

    // Build CTEs for start and end events
    const ctes: string[] = [];

    // Start events CTE (first event in funnel)
    const startEventCte = await this.buildSingleEventCte(
      firstEvent,
      'start_events',
      projectId,
      startDate,
      endDate,
    );
    ctes.push(startEventCte);

    // End events CTE (last event in funnel) - with extended date range
    const endEventCte = await this.buildSingleEventCte(
      lastEvent,
      'end_events',
      projectId,
      startDate,
      extendedEndDate,
    );
    ctes.push(endEventCte);

    // Add cohort CTEs (computed once per query, not per row)
    cohortIds.forEach((cohortId) => {
      const cohortMeta = cohortMetadata.get(cohortId);
      const cohortQuery = buildCohortMembershipQuery(cohortId, projectId, cohortMeta);
      ctes.push(`${getCohortCteName(cohortId)} AS (${cohortQuery})`);
    });

    // Define group column (profile_id or session_id)
    const groupCol = funnelGroup === 'profile_id' ? 'profile_id' : 'session_id';

    // Build breakdown columns (from start_events with 'se' alias)
    const breakdownColumns = breakdowns.map((b, index) => {
      const columnWithAlias = this.getBreakdownColumnWithAlias(b.name, projectId, b.cohortId, 'se');
      return `${columnWithAlias} as b_${index}`;
    });
    const breakdownGroupBy = breakdowns.map((b, index) => `b_${index}`);

    // Build LEFT JOINs for cohorts (on start_events)
    const cohortJoins = cohortIds.length > 0 ? '\n      ' + cohortIds.map((cohortId) => {
      const cohortAlias = getCohortAlias(cohortId);
      const cohortCte = getCohortCteName(cohortId);
      return `LEFT ANY JOIN ${cohortCte} AS ${cohortAlias} ON ${cohortAlias}.profile_id = se.profile_id`;
    }).join('\n      ') : '';

    // Build WITH clause
    const withClause = ctes.length > 0 ? `WITH ${ctes.join(', ')} ` : '';

    // Build self-join query
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
        `uniqExact(${groupCol}) AS total_first`,
        `uniqExact(conversion_${groupCol}) AS conversions`,
        `round(100.0 * uniqExact(conversion_${groupCol}) / uniqExact(${groupCol}), 2) AS conversion_rate_percentage`,
      ])
      .from(
        clix.exp(`
        (${withClause}SELECT
          ${clix.toStartOf('se.created_at', interval)} as event_day,
          se.${groupCol},
          ee.${groupCol} as conversion_${groupCol}${breakdownColumns.length ? ',\n          ' + breakdownColumns.join(',\n          ') : ''}
        FROM start_events se
        LEFT JOIN end_events ee ON
          ee.${groupCol} = se.${groupCol}
          AND ee.created_at > se.created_at
          AND ee.created_at <= se.created_at + INTERVAL ${funnelWindowSeconds} SECOND
        ${cohortJoins})
      `),
      )
      .groupBy(['event_day', ...breakdownGroupBy]);

    for (const order of ['event_day', ...breakdownGroupBy]) {
      query.orderBy(order);
    }

    const results = await query.execute();

    // Sort series by average conversion rate (descending) when there are breakdowns
    const series = this.toSeries(results, breakdowns, limit);

    if (breakdowns.length > 0) {
      series.sort((a, b) => {
        const avgRateA = a.data.reduce((sum, d) => sum + d.rate, 0) / (a.data.length || 1);
        const avgRateB = b.data.reduce((sum, d) => sum + d.rate, 0) / (b.data.length || 1);
        return avgRateB - avgRateA; // Descending order
      });
    }

    // Apply limit after sorting
    const limitedSeries = limit && breakdowns.length > 0 ? series.slice(0, limit) : series;

    return limitedSeries.map((serie, serieIndex) => {
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
    });
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
