import { getPreviousMetric, groupByLabels } from '@openpanel/common';
import type { ISerieDataItem } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type {
  FinalChart,
  IChartEventItem,
  IChartInput,
} from '@openpanel/validation';
import { chQuery } from '../clickhouse/client';
import {
  getAggregateChartSql,
  getChartPrevStartEndDate,
} from '../services/chart.service';
import {
  getOrganizationSubscriptionChartEndDate,
  getSettingsForProject,
} from '../services/organization.service';
import { compute } from './compute';
import { fetch } from './fetch';
import { format } from './format';
import { normalize } from './normalize';
import { plan } from './plan';
import type { ConcreteSeries } from './types';

/**
 * Chart Engine - Main entry point
 * Executes the pipeline: normalize -> plan -> fetch -> compute -> format
 */
export async function executeChart(input: IChartInput): Promise<FinalChart> {
  // Stage 1: Normalize input
  const normalized = await normalize(input);

  // Handle subscription end date limit
  const endDate = await getOrganizationSubscriptionChartEndDate(
    input.projectId,
    normalized.endDate,
  );
  if (endDate) {
    normalized.endDate = endDate;
  }

  // Stage 2: Create execution plan
  const executionPlan = await plan(normalized);

  // Stage 3: Fetch data for event series (current period)
  const fetchedSeries = await fetch(executionPlan);

  // Stage 4: Compute formula series
  const computedSeries = compute(fetchedSeries, executionPlan.definitions);

  // Stage 5: Fetch previous period if requested
  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    const currentPeriod = {
      startDate: normalized.startDate,
      endDate: normalized.endDate,
    };
    const previousPeriod = getChartPrevStartEndDate(currentPeriod);

    const previousPlan = await plan({
      ...normalized,
      ...previousPeriod,
    });

    const previousFetched = await fetch(previousPlan);
    previousSeries = compute(previousFetched, previousPlan.definitions);
  }

  // Stage 6: Format final output with previous period data
  const includeAlphaIds = executionPlan.definitions.length > 1;
  const response = format(
    computedSeries,
    executionPlan.definitions,
    includeAlphaIds,
    previousSeries,
  );

  return response;
}

/**
 * Aggregate Chart Engine - Optimized for bar/pie charts without time series
 * Executes a simplified pipeline: normalize -> fetch aggregate -> format
 */
export async function executeAggregateChart(
  input: IChartInput,
): Promise<FinalChart> {
  // Stage 1: Normalize input
  const normalized = await normalize(input);

  // Handle subscription end date limit
  const endDate = await getOrganizationSubscriptionChartEndDate(
    input.projectId,
    normalized.endDate,
  );
  if (endDate) {
    normalized.endDate = endDate;
  }

  const { timezone } = await getSettingsForProject(normalized.projectId);

  // Stage 2: Fetch aggregate data for current period (event series only)
  const fetchedSeries: ConcreteSeries[] = [];

  for (let i = 0; i < normalized.series.length; i++) {
    const definition = normalized.series[i]!;

    if (definition.type !== 'event') {
      // Skip formulas - they'll be computed in the next stage
      continue;
    }

    const event = definition as IChartEventItem & { type: 'event' };

    // Build query input
    const queryInput = {
      event: {
        id: event.id,
        name: event.name,
        segment: event.segment,
        filters: event.filters,
        displayName: event.displayName,
        property: event.property,
      },
      projectId: normalized.projectId,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      breakdowns: normalized.breakdowns,
      limit: normalized.limit,
      metric: normalized.metric,
      previous: normalized.previous,
      timezone,
    };

    // Execute aggregate query
    let queryResult = await chQuery<ISerieDataItem>(
      getAggregateChartSql(queryInput),
      {
        session_timezone: timezone,
      },
    );

    // Fallback: if no results with breakdowns, try without breakdowns
    if (queryResult.length === 0 && normalized.breakdowns.length > 0) {
      queryResult = await chQuery<ISerieDataItem>(
        getAggregateChartSql({
          ...queryInput,
          breakdowns: [],
        }),
        {
          session_timezone: timezone,
        },
      );
    }

    // Group by labels (handles breakdown expansion)
    const groupedSeries = groupByLabels(queryResult);

    // Create concrete series for each grouped result
    groupedSeries.forEach((grouped) => {
      // Extract breakdown value from name array
      const breakdownValue =
        normalized.breakdowns.length > 0 && grouped.name.length > 1
          ? grouped.name.slice(1).join(' - ')
          : undefined;

      // Build breakdowns object
      const breakdowns: Record<string, string> | undefined =
        normalized.breakdowns.length > 0 && grouped.name.length > 1
          ? {}
          : undefined;

      if (breakdowns) {
        normalized.breakdowns.forEach((breakdown, idx) => {
          const breakdownNamePart = grouped.name[idx + 1];
          if (breakdownNamePart) {
            breakdowns[breakdown.name] = breakdownNamePart;
          }
        });
      }

      // Build filters including breakdown value
      const filters = [...event.filters];
      if (breakdownValue && normalized.breakdowns.length > 0) {
        normalized.breakdowns.forEach((breakdown, idx) => {
          const breakdownNamePart = grouped.name[idx + 1];
          if (breakdownNamePart) {
            filters.push({
              id: `breakdown-${idx}`,
              name: breakdown.name,
              operator: 'is',
              value: [breakdownNamePart],
            });
          }
        });
      }

      // For aggregate charts, grouped.data should have a single data point
      // (since we use a constant date in the query)
      const concrete: ConcreteSeries = {
        id: `${event.name}-${grouped.name.join('-')}-${i}`,
        definitionId: definition.id ?? alphabetIds[i] ?? `series-${i}`,
        definitionIndex: i,
        name: grouped.name,
        context: {
          event: event.name,
          filters,
          breakdownValue,
          breakdowns,
        },
        data: grouped.data,
        definition,
      };

      fetchedSeries.push(concrete);
    });
  }

  // Stage 3: Compute formula series from fetched event series
  const computedSeries = compute(fetchedSeries, normalized.series);

  // Stage 4: Fetch previous period if requested
  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    const currentPeriod = {
      startDate: normalized.startDate,
      endDate: normalized.endDate,
    };
    const previousPeriod = getChartPrevStartEndDate(currentPeriod);

    const previousFetchedSeries: ConcreteSeries[] = [];

    for (let i = 0; i < normalized.series.length; i++) {
      const definition = normalized.series[i]!;

      if (definition.type !== 'event') {
        continue;
      }

      const event = definition as IChartEventItem & { type: 'event' };

      const queryInput = {
        event: {
          id: event.id,
          name: event.name,
          segment: event.segment,
          filters: event.filters,
          displayName: event.displayName,
          property: event.property,
        },
        projectId: normalized.projectId,
        startDate: previousPeriod.startDate,
        endDate: previousPeriod.endDate,
        breakdowns: normalized.breakdowns,
        limit: normalized.limit,
        metric: normalized.metric,
        previous: normalized.previous,
        timezone,
      };

      let queryResult = await chQuery<ISerieDataItem>(
        getAggregateChartSql(queryInput),
        {
          session_timezone: timezone,
        },
      );

      if (queryResult.length === 0 && normalized.breakdowns.length > 0) {
        queryResult = await chQuery<ISerieDataItem>(
          getAggregateChartSql({
            ...queryInput,
            breakdowns: [],
          }),
          {
            session_timezone: timezone,
          },
        );
      }

      const groupedSeries = groupByLabels(queryResult);

      groupedSeries.forEach((grouped) => {
        const breakdownValue =
          normalized.breakdowns.length > 0 && grouped.name.length > 1
            ? grouped.name.slice(1).join(' - ')
            : undefined;

        const breakdowns: Record<string, string> | undefined =
          normalized.breakdowns.length > 0 && grouped.name.length > 1
            ? {}
            : undefined;

        if (breakdowns) {
          normalized.breakdowns.forEach((breakdown, idx) => {
            const breakdownNamePart = grouped.name[idx + 1];
            if (breakdownNamePart) {
              breakdowns[breakdown.name] = breakdownNamePart;
            }
          });
        }

        const filters = [...event.filters];
        if (breakdownValue && normalized.breakdowns.length > 0) {
          normalized.breakdowns.forEach((breakdown, idx) => {
            const breakdownNamePart = grouped.name[idx + 1];
            if (breakdownNamePart) {
              filters.push({
                id: `breakdown-${idx}`,
                name: breakdown.name,
                operator: 'is',
                value: [breakdownNamePart],
              });
            }
          });
        }

        const concrete: ConcreteSeries = {
          id: `${event.name}-${grouped.name.join('-')}-${i}`,
          definitionId: definition.id ?? alphabetIds[i] ?? `series-${i}`,
          definitionIndex: i,
          name: grouped.name,
          context: {
            event: event.name,
            filters,
            breakdownValue,
            breakdowns,
          },
          data: grouped.data,
          definition,
        };

        previousFetchedSeries.push(concrete);
      });
    }

    // Compute formula series for previous period
    previousSeries = compute(previousFetchedSeries, normalized.series);
  }

  // Stage 5: Format final output with previous period data
  const includeAlphaIds = normalized.series.length > 1;
  const response = format(
    computedSeries,
    normalized.series,
    includeAlphaIds,
    previousSeries,
    normalized.limit,
  );

  return response;
}

// Export as ChartEngine for backward compatibility
export const ChartEngine = {
  execute: executeChart,
};

// Export aggregate chart engine
export const AggregateChartEngine = {
  execute: executeAggregateChart,
};
