import { getChartPrevStartEndDate } from '@openpanel/shared';
import type { ServiceDeps } from '../../../../services';
import { getOrganizationSubscriptionChartEndDate } from '../../../organization/organization.service';
import type {
  FinalChart,
  IReportInput,
} from '../../../report/report.constants';
import { compute } from './compute';
import { fetch, fetchAggregate } from './fetch';
import { format } from './format';
import { type NormalizedInput, normalize } from './normalize';
import { plan } from './plan';
import type { ConcreteSeries } from './types';

/** Normalize, then clamp the end date to the organization's subscription window. */
async function normalizeWithinSubscription(
  deps: ServiceDeps,
  input: IReportInput
): Promise<NormalizedInput> {
  const normalized = await normalize(deps, input);
  const endDate = await getOrganizationSubscriptionChartEndDate(
    deps,
    input.projectId,
    normalized.endDate
  );
  if (endDate) {
    normalized.endDate = endDate;
  }
  return normalized;
}

/** Time-series chart: normalize -> plan -> fetch -> compute -> format. */
export async function executeChart(
  deps: ServiceDeps,
  input: IReportInput
): Promise<FinalChart> {
  const normalized = await normalizeWithinSubscription(deps, input);
  const executionPlan = plan(normalized);
  const computedSeries = compute(
    await fetch(deps, executionPlan),
    executionPlan.definitions
  );

  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    const previousPlan = plan({
      ...normalized,
      ...getChartPrevStartEndDate({
        startDate: normalized.startDate,
        endDate: normalized.endDate,
      }),
    });
    previousSeries = compute(
      await fetch(deps, previousPlan),
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
  deps: ServiceDeps,
  input: IReportInput
): Promise<FinalChart> {
  const normalized = await normalizeWithinSubscription(deps, input);
  const { timezone } = normalized;
  const currentPeriod = {
    startDate: normalized.startDate,
    endDate: normalized.endDate,
  };
  const computedSeries = compute(
    await fetchAggregate(deps, normalized, currentPeriod, timezone),
    normalized.series
  );

  let previousSeries: ConcreteSeries[] | null = null;
  if (input.previous) {
    previousSeries = compute(
      await fetchAggregate(
        deps,
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
