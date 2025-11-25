import {
  average,
  getPreviousMetric,
  max,
  min,
  round,
  slug,
  sum,
} from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type { FinalChart } from '@openpanel/validation';
import type { ConcreteSeries } from './types';

/**
 * Format concrete series into FinalChart format (backward compatible)
 * TODO: Migrate frontend to use cleaner ChartResponse format
 */
export function format(
  concreteSeries: ConcreteSeries[],
  definitions: Array<{
    id?: string;
    type: 'event' | 'formula';
    displayName?: string;
    formula?: string;
    name?: string;
  }>,
  includeAlphaIds: boolean,
  previousSeries: ConcreteSeries[] | null = null,
  limit: number | undefined = undefined,
): FinalChart {
  const series = concreteSeries.map((cs) => {
    // Find definition for this series
    const definition = definitions[cs.definitionIndex];
    const alphaId = includeAlphaIds
      ? alphabetIds[cs.definitionIndex]
      : undefined;

    // Build display name with optional alpha ID
    let displayName: string[];

    // Replace the first name (which is the event name) with the display name if it exists
    const names = cs.name.slice(0);
    if (cs.definition.displayName) {
      names.splice(0, 1, cs.definition.displayName);
    }
    // Add the alpha ID to the first name if it exists
    if (alphaId) {
      displayName = [`(${alphaId}) ${names[0]}`, ...names.slice(1)];
    } else {
      displayName = names;
    }

    // Calculate metrics for this series
    const counts = cs.data.map((d) => d.count);
    const metrics = {
      sum: sum(counts),
      average: round(average(counts), 2),
      min: min(counts),
      max: max(counts),
      count: cs.data.find((item) => !!item.total_count)?.total_count,
    };

    // Build event object for compatibility
    const eventName =
      definition?.type === 'formula'
        ? definition.displayName || definition.formula || 'Formula'
        : definition?.name || cs.context.event || 'unknown';

    // Find matching previous series
    const previousSerie = previousSeries?.find(
      (ps) =>
        ps.definitionIndex === cs.definitionIndex &&
        ps.name.slice(1).join(':::') === cs.name.slice(1).join(':::'),
    );

    return {
      id: cs.id,
      names: displayName,
      // TODO: Do we need this now?
      event: {
        id: definition?.id,
        name: eventName,
        breakdowns: cs.context.breakdowns,
      },
      metrics: {
        ...metrics,
        ...(previousSerie
          ? {
              previous: {
                sum: getPreviousMetric(
                  metrics.sum,
                  sum(previousSerie.data.map((d) => d.count)),
                ),
                average: getPreviousMetric(
                  metrics.average,
                  round(average(previousSerie.data.map((d) => d.count)), 2),
                ),
                min: getPreviousMetric(
                  metrics.min,
                  min(previousSerie.data.map((d) => d.count)),
                ),
                max: getPreviousMetric(
                  metrics.max,
                  max(previousSerie.data.map((d) => d.count)),
                ),
                count: getPreviousMetric(
                  metrics.count ?? 0,
                  previousSerie.data.find((item) => !!item.total_count)
                    ?.total_count ?? null,
                ),
              },
            }
          : {}),
      },
      data: cs.data.map((item, index) => ({
        date: item.date,
        count: item.count,
        previous: previousSerie?.data[index]
          ? getPreviousMetric(
              item.count,
              previousSerie.data[index]?.count ?? null,
            )
          : undefined,
      })),
    };
  });

  // Sort series by sum (biggest first)
  series.sort((a, b) => b.metrics.sum - a.metrics.sum);

  // Calculate global metrics
  const allValues = concreteSeries.flatMap((cs) => cs.data.map((d) => d.count));
  const globalMetrics = {
    sum: sum(allValues),
    average: round(average(allValues), 2),
    min: min(allValues),
    max: max(allValues),
    count: undefined as number | undefined,
  };

  return {
    series: limit ? series.slice(0, limit) : series,
    metrics: globalMetrics,
  };
}
