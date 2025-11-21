import { getPreviousMetric } from '@openpanel/common';

import type { FinalChart, IChartInput } from '@openpanel/validation';
import { getChartPrevStartEndDate } from '../services/chart.service';
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
  const { timezone } = await getSettingsForProject(input.projectId);

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

// Export as ChartEngine for backward compatibility
export const ChartEngine = {
  execute: executeChart,
};
