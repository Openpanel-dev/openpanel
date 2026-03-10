import type { ISerieDataItem } from '@openpanel/common';
import { groupByLabels } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type { IGetChartDataInput } from '@openpanel/validation';
import { chQuery } from '../clickhouse/client';
import { getChartSql } from '../services/chart.service';
import { getCustomEventByName } from '../services/custom-event.service';
import type { ConcreteSeries, Plan } from './types';

/**
 * Fetch data for all event series in the plan
 * This handles breakdown expansion automatically via groupByLabels
 */
export async function fetch(plan: Plan): Promise<ConcreteSeries[]> {
  const results: ConcreteSeries[] = [];

  // Process each event definition
  for (let i = 0; i < plan.definitions.length; i++) {
    const definition = plan.definitions[i]!;

    if (definition.type !== 'event') {
      // Skip formulas - they'll be handled in compute stage
      continue;
    }

    const event = definition as typeof definition & { type: 'event' };

    // Find the corresponding concrete series placeholder
    const placeholder = plan.concreteSeries.find(
      (cs) => cs.definitionId === definition.id,
    );

    if (!placeholder) {
      continue;
    }

    // Check if this is a custom event
    const customEvent = await getCustomEventByName(
      event.name,
      plan.input.projectId,
    );

    // Build query input — merge global filters into per-event filters
    const globalFilters = plan.input.globalFilters ?? [];
    const queryInput: IGetChartDataInput = {
      event: {
        id: event.id,
        name: event.name,
        segment: event.segment,
        filters: [...event.filters, ...globalFilters],
        displayName: event.displayName,
        property: event.property,
      },
      projectId: plan.input.projectId,
      startDate: plan.input.startDate,
      endDate: plan.input.endDate,
      breakdowns: plan.input.breakdowns,
      interval: plan.input.interval,
      chartType: plan.input.chartType,
      metric: plan.input.metric,
      previous: plan.input.previous ?? false,
      limit: plan.input.limit,
      offset: plan.input.offset,
      criteria: plan.input.criteria,
      funnelGroup: plan.input.funnelGroup,
      funnelWindow: plan.input.funnelWindow,
      cohortFilters: plan.input.cohortFilters ?? [],
      globalFilters: plan.input.globalFilters ?? [],
      holdProperties: plan.input.holdProperties ?? [],
      measuring: plan.input.measuring ?? 'conversion_rate',
    };

    // Execute query with custom event if applicable
    let queryResult = await chQuery<ISerieDataItem>(
      await getChartSql({
        ...queryInput,
        timezone: plan.timezone,
        customEvent: customEvent
          ? {
              name: customEvent.name,
              definition: customEvent.definition as any,
            }
          : undefined,
      }),
      {
        session_timezone: plan.timezone,
      },
    );

    // Fallback: if no results with breakdowns, try without breakdowns
    if (queryResult.length === 0 && plan.input.breakdowns.length > 0) {
      queryResult = await chQuery<ISerieDataItem>(
        await getChartSql({
          ...queryInput,
          breakdowns: [],
          timezone: plan.timezone,
          customEvent: customEvent
            ? {
                name: customEvent.name,
                definition: customEvent.definition as any,
              }
            : undefined,
        }),
        {
          session_timezone: plan.timezone,
        },
      );
    }

    // Group by labels (handles breakdown expansion)
    const groupedSeries = groupByLabels(queryResult);

    // Create concrete series for each grouped result
    groupedSeries.forEach((grouped) => {
      // Extract breakdown value from name array
      // If breakdowns exist, name[0] is event name, name[1+] are breakdown values
      const breakdownValue =
        plan.input.breakdowns.length > 0 && grouped.name.length > 1
          ? grouped.name.slice(1).join(' - ')
          : undefined;

      // Build breakdowns object: { country: 'SE', path: '/ewoqmepwq' }
      const breakdowns: Record<string, string> | undefined =
        plan.input.breakdowns.length > 0 && grouped.name.length > 1
          ? {}
          : undefined;

      if (breakdowns) {
        plan.input.breakdowns.forEach((breakdown, idx) => {
          const breakdownNamePart = grouped.name[idx + 1];
          if (breakdownNamePart) {
            breakdowns[breakdown.name] = breakdownNamePart;
          }
        });
      }

      // Build filters including breakdown value
      const filters = [...event.filters];
      if (breakdownValue && plan.input.breakdowns.length > 0) {
        // Add breakdown filter
        plan.input.breakdowns.forEach((breakdown, idx) => {
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
        id: `${placeholder.id}-${grouped.name.join('-')}`,
        definitionId: definition.id ?? alphabetIds[i] ?? `series-${i}`,
        definitionIndex: i,
        name: grouped.name,
        context: {
          event: event.name,
          filters,
          breakdownValue,
          breakdowns,
        },
        data: grouped.data.map((item) => ({
          date: item.date,
          count: item.count,
          total_count: item.total_count,
        })),
        definition,
      };

      results.push(concrete);
    });
  }

  return results;
}
