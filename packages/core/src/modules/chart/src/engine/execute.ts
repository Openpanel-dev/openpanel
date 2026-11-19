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
  const previousPlan = input.previous
    ? plan({
        ...normalized,
        ...getChartPrevStartEndDate({
          startDate: normalized.startDate,
          endDate: normalized.endDate,
        }),
      })
    : null;

  // The two periods share nothing but the plan, so they go out together: a
  // 3-series comparison chart is one round trip's worth of latency, not two.
  const [computedSeries, previousSeries] = await Promise.all([
    fetch(deps, executionPlan).then((series) =>
      compute(series, executionPlan.definitions)
    ),
    previousPlan
      ? fetch(deps, previousPlan).then((series) =>
          compute(series, previousPlan.definitions)
        )
      : Promise.resolve<ConcreteSeries[] | null>(null),
  ]);

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
  const [computedSeries, previousSeries] = await Promise.all([
    fetchAggregate(deps, normalized, currentPeriod, timezone).then((series) =>
      compute(series, normalized.series)
    ),
    input.previous
      ? fetchAggregate(
          deps,
          normalized,
          getChartPrevStartEndDate(currentPeriod),
          timezone
        ).then((series) => compute(series, normalized.series))
      : Promise.resolve<ConcreteSeries[] | null>(null),
  ]);

  return format(
    computedSeries,
    normalized.series,
    normalized.series.length > 1,
    previousSeries,
    normalized.limit
  );
}
