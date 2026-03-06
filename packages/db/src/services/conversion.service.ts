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
    extraColumns: string[] = [],
  ): Promise<string> {
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
      const filterClauses = event.filters && event.filters.length > 0
        ? Object.values(getEventFiltersWhereClause(event.filters, projectId))
        : [];
      const filterWhere = filterClauses.length > 0
        ? ' AND ' + filterClauses.join(' AND ')
        : '';

      // If any filter references profile.*, join the profiles table inside the CTE
      const profileFilters = (event.filters || []).filter(f => f.name.startsWith('profile.'));
      let profileJoinClause = '';
      if (profileFilters.length > 0) {
        const profileColumns = [...new Set(
          profileFilters.map(f => f.name.replace('profile.', '').split('.')[0])
        )];
        profileJoinClause = `\n        LEFT JOIN (SELECT id, ${profileColumns.join(', ')} FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = '${projectId}') AS profile ON profile.id = profile_id`;
      }

      // Minimal SELECT: only the columns actually needed downstream
      const baseColumns = ['profile_id', 'session_id', 'created_at'];
      const selectColumns = [...new Set([...baseColumns, ...extraColumns])];
      const selectList = selectColumns.map(col => `\`${col}\``).join(', ');

      return `${cteName} AS (
        SELECT ${selectList}
        FROM ${TABLE_NAMES.events}${profileJoinClause}
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

    // Get materialized columns to ensure UNION compatibility (events table only)
    const materializedColumns = await getMaterializedColumns('events');
    const materializedColumnNames = Object.values(materializedColumns);
    const materializedColumnsSelect = materializedColumnNames.length > 0
      ? `, ${materializedColumnNames.map(col => `\`${col}\``).join(', ')}`
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
    holdProperties = [],
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
    const endDateObj = new Date(endDate);
    const extendedEndDateObj = new Date(endDateObj.getTime() + funnelWindowSeconds * 1000);
    const extendedEndDate = formatClickhouseDate(extendedEndDateObj);

    // Ensure materialized columns cache is warm so getSelectPropertyKey works synchronously
    await getMaterializedColumns('events');

    // Determine which event-property columns are needed from start_events
    // (profile.* and cohort breakdowns are handled separately via JOINs)
    const breakdownExtraCols = breakdowns
      .filter(b => !b.name.startsWith('profile.') && !b.cohortId && !b.name.startsWith('cohort:'))
      .flatMap(b => {
        const col = getSelectPropertyKey(b.name, projectId, undefined);
        if (col.startsWith('profile.') || col.startsWith('if(')) return [];
        // Map access (not materialized) — need the whole properties map
        if (col.startsWith('properties[')) return ['properties'];
        return [col];
      });

    // Hold property constant: columns needed in both CTEs for the JOIN condition
    const holdExtraCols = holdProperties.flatMap(prop => {
      const col = getSelectPropertyKey(prop, projectId, undefined);
      if (col.startsWith('properties[')) return ['properties'];
      return [col];
    });

    const startExtraCols = [...new Set([...breakdownExtraCols, ...holdExtraCols])];
    const endExtraCols = [...new Set(holdExtraCols)];

    // Build CTEs for start and end events
    const ctes: string[] = [];

    // Start events CTE — includes columns needed for breakdowns + hold properties
    const startEventCte = await this.buildSingleEventCte(
      firstEvent,
      'start_events',
      projectId,
      startDate,
      endDate,
      startExtraCols,
    );
    ctes.push(startEventCte);

    // End events CTE — needs hold property columns for the JOIN condition
    const endEventCte = await this.buildSingleEventCte(
      lastEvent,
      'end_events',
      projectId,
      startDate,
      extendedEndDate,
      endExtraCols,
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

    // Build LEFT JOIN for profile table if any breakdown uses profile.*
    const profileBreakdowns = breakdowns.filter(b => b.name.startsWith('profile.'));
    let profileJoin = '';
    if (profileBreakdowns.length > 0) {
      const matCols = await getMaterializedColumns('profiles');
      const profileColumns = [...new Set(
        profileBreakdowns.map(b => {
          if (b.name.startsWith('profile.properties.')) {
            const cached = matCols[b.name];
            if (cached) {
              // cached = "profile.campaign" -> select "campaign" (the materialized column)
              return cached.replace('profile.', '');
            }
          }
          // Fall back to the top-level field name (e.g., "properties", "email")
          return b.name.replace('profile.', '').split('.')[0];
        })
      )];
      profileJoin = `\n      LEFT JOIN (SELECT id, ${profileColumns.join(', ')} FROM ${TABLE_NAMES.profiles} FINAL WHERE project_id = '${projectId}') AS profile ON profile.id = se.profile_id`;
    }

    // Grace period for events that fire very close together (like Mixpanel)
    // Allows end event to happen up to 2 seconds before start event
    const gracePeriodSeconds = 2;

    // Hold property constant: require same property value in start and end events
    const holdJoinConditions = holdProperties.map(prop => {
      const col = getSelectPropertyKey(prop, projectId, undefined);
      return `AND se.${col} = ee.${col}`;
    }).join('\n        ');

    const toStartOf = clix.toStartOf('se.created_at', interval);
    const breakdownGroupByStr = breakdownGroupBy.join(', ');

    // Inner SELECT: raw per-event rows from the self-join (no aggregation yet)
    const innerSQL = `
      SELECT
        ${toStartOf} AS event_day,
        se.${groupCol} AS ${groupCol},
        ee.${groupCol} AS conversion_${groupCol}${breakdownColumns.length ? ',\n        ' + breakdownColumns.join(',\n        ') : ''}
      FROM start_events se${profileJoin}
      LEFT JOIN end_events ee ON
        ee.${groupCol} = se.${groupCol}
        AND ee.created_at >= se.created_at - INTERVAL ${gracePeriodSeconds} SECOND
        AND ee.created_at <= se.created_at + INTERVAL ${funnelWindowSeconds} SECOND
        ${holdJoinConditions}
      ${cohortJoins}`;

    // agg CTE: aggregate inner rows into (event_day, breakdowns) buckets
    const aggCte = `agg AS (
      SELECT
        event_day,
        ${breakdownGroupBy.length ? breakdownGroupByStr + ',\n        ' : ''}uniqExact(${groupCol}) AS total_first,
        uniqExact(conversion_${groupCol}) AS conversions,
        round(100.0 * uniqExact(conversion_${groupCol}) / uniqExact(${groupCol}), 2) AS conversion_rate_percentage
      FROM (${innerSQL})
      GROUP BY event_day${breakdownGroupBy.length ? ', ' + breakdownGroupByStr : ''}
    )`;

    let finalSql: string;

    if (breakdownGroupBy.length > 0) {
      // top_breakdowns CTE: rank breakdowns by avg conversion rate, take top N
      const topBreakdownsCte = `top_breakdowns AS (
        SELECT ${breakdownGroupByStr}, avg(conversion_rate_percentage) AS avg_rate
        FROM agg
        GROUP BY ${breakdownGroupByStr}
        ORDER BY avg_rate DESC
        LIMIT ${limit ?? 50}
      )`;

      const joinConditions = breakdownGroupBy
        .map(b => `agg.${b} = top_breakdowns.${b}`)
        .join(' AND ');

      finalSql = `
        WITH ${[...ctes, aggCte, topBreakdownsCte].join(',\n')}
        SELECT
          agg.event_day,
          ${breakdownGroupBy.map(b => `agg.${b}`).join(',\n          ')},
          agg.total_first,
          agg.conversions,
          agg.conversion_rate_percentage
        FROM agg
        INNER JOIN top_breakdowns ON ${joinConditions}
        ORDER BY top_breakdowns.avg_rate DESC, agg.event_day ASC`;
    } else {
      finalSql = `
        WITH ${[...ctes, aggCte].join(',\n')}
        SELECT event_day, total_first, conversions, conversion_rate_percentage
        FROM agg
        ORDER BY event_day ASC`;
    }

    const rawResult = await this.client.query({
      query: finalSql,
      clickhouse_settings: { session_timezone: timezone },
    });
    const json = await rawResult.json() as {
      data: {
        event_day: string;
        total_first: number;
        conversions: number;
        conversion_rate_percentage: number;
        [key: string]: string | number;
      }[];
    };
    const results = json.data;

    const resultSeries = this.toSeries(results, breakdowns);
    const limitedSeries = resultSeries;

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
  ) {
    if (!breakdowns.length) {
      return [
        {
          id: 'conversion',
          breakdowns: [],
          data: data.map((d) => ({
            date: d.event_day,
            total: Number(d.total_first),
            conversions: Number(d.conversions),
            rate: Number(d.conversion_rate_percentage),
          })),
        },
      ];
    }

    // Group by breakdown values
    const series = data.reduce(
      (acc, d) => {
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
          total: Number(d.total_first),
          conversions: Number(d.conversions),
          rate: Number(d.conversion_rate_percentage),
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
