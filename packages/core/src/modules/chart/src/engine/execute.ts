import { getChartPrevStartEndDate } from '@openpanel/core';
import type { FinalChart, IReportInput } from '@openpanel/validation';
import {
  getOrganizationSubscriptionChartEndDate,
  getSettingsForProject,
} from '../../../organization/organization.service';
import { compute } from './compute';
import { fetch, fetchAggregate } from './fetch';
import { format } from './format';
import { type NormalizedInput, normalize } from './normalize';
import { plan } from './plan';
import type { ConcreteSeries } from './types';

/** Normalize, then clamp the end date to the organization's subscription window. */
async function normalizeWithinSubscription(
  input: IReportInput
): Promise<NormalizedInput> {
  const normalized = await normalize(input);
  const endDate = await getOrganizationSubscriptionChartEndDate(
    input.projectId,
    normalized.endDate
  );
  if (endDate) {
    normalized.endDate = endDate;
  }
  return normalized;
}

/** Time-series chart: normalize -> plan -> fetch -> compute -> format. */
export async function executeChart(input: IReportInput): Promise<FinalChart> {
  const normalized = await normalizeWithinSubscription(input);
  const executionPlan = await plan(normalized);
  const computedSeries = compute(
    await fetch(executionPlan),
    executionPlan.definitions
  );

  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    const previousPlan = await plan({
      ...normalized,
      ...getChartPrevStartEndDate({
        startDate: normalized.startDate,
        endDate: normalized.endDate,
      }),
    });
    previousSeries = compute(
      await fetch(previousPlan),
      previousPlan.definitions
    );
  }

  return format(
    computedSeries,
    executionPlan.definitions,
    executionPlan.definitions.length > 1,
    previousSeries,
    normalized.limit
  );
}

/** Bar/pie chart without a time axis: normalize -> fetch aggregate -> format. */
export async function executeAggregateChart(
  input: IReportInput
): Promise<FinalChart> {
  const normalized = await normalizeWithinSubscription(input);
  const { timezone } = await getSettingsForProject(normalized.projectId);
  const currentPeriod = {
    startDate: normalized.startDate,
    endDate: normalized.endDate,
  };
  const computedSeries = compute(
    await fetchAggregate(normalized, currentPeriod, timezone),
    normalized.series
  );

  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    previousSeries = compute(
      await fetchAggregate(
        normalized,
        getChartPrevStartEndDate(currentPeriod),
        timezone
      ),
      normalized.series
    );
  }

  return format(
    computedSeries,
    normalized.series,
    normalized.series.length > 1,
    previousSeries,
    normalized.limit
  );
}

export const ChartEngine = {
  execute: executeChart,
};

export const AggregateChartEngine = {
  execute: executeAggregateChart,
};
