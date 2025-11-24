import { round } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type { IChartFormula } from '@openpanel/validation';
import * as mathjs from 'mathjs';
import type { ConcreteSeries } from './types';

/**
 * Compute formula series from fetched event series
 * Formulas reference event series using alphabet IDs (A, B, C, etc.)
 */
export function compute(
  fetchedSeries: ConcreteSeries[],
  definitions: Array<{
    type: 'event' | 'formula';
    id?: string;
    formula?: string;
  }>,
): ConcreteSeries[] {
  const results: ConcreteSeries[] = [...fetchedSeries];

  // Process formulas in order (they can reference previous formulas)
  definitions.forEach((definition, formulaIndex) => {
    if (definition.type !== 'formula') {
      return;
    }

    const formula = definition as IChartFormula;
    if (!formula.formula) {
      return;
    }

    // Group ALL series (events + previously computed formulas) by breakdown signature
    // Series with the same breakdown values should be computed together
    const seriesByBreakdown = new Map<string, ConcreteSeries[]>();

    // Include both fetched event series AND previously computed formulas
    const allSeries = [
      ...fetchedSeries,
      ...results.filter((s) => s.definitionIndex < formulaIndex),
    ];

    allSeries.forEach((serie) => {
      // Create breakdown signature: skip first name part (event/formula name) and use breakdown values
      // If name.length === 1, it means no breakdowns (just event name)
      // If name.length > 1, name[0] is event name, name[1+] are breakdown values
      const breakdownSignature =
        serie.name.length > 1 ? serie.name.slice(1).join(':::') : '';

      if (!seriesByBreakdown.has(breakdownSignature)) {
        seriesByBreakdown.set(breakdownSignature, []);
      }
      seriesByBreakdown.get(breakdownSignature)!.push(serie);
    });

    // Compute formula for each breakdown group
    for (const [breakdownSignature, breakdownSeries] of seriesByBreakdown) {
      // Map series by their definition index for formula evaluation
      const seriesByIndex = new Map<number, ConcreteSeries>();
      breakdownSeries.forEach((serie) => {
        seriesByIndex.set(serie.definitionIndex, serie);
      });

      // Get all unique dates across all series in this breakdown group
      const allDates = new Set<string>();
      breakdownSeries.forEach((serie) => {
        serie.data.forEach((item) => {
          allDates.add(item.date);
        });
      });

      const sortedDates = Array.from(allDates).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime(),
      );

      // Calculate total_count for the formula using the same formula applied to input series' total_count values
      // total_count is constant across all dates for a breakdown group, so compute it once
      const totalCountScope: Record<string, number> = {};
      definitions.slice(0, formulaIndex).forEach((depDef, depIndex) => {
        const readableId = alphabetIds[depIndex];
        if (!readableId) {
          return;
        }

        // Find the series for this dependency in the current breakdown group
        const depSeries = seriesByIndex.get(depIndex);
        if (depSeries) {
          // Get total_count from any data point (it's the same for all dates)
          const totalCount = depSeries.data.find(
            (d) => d.total_count != null,
          )?.total_count;
          totalCountScope[readableId] = totalCount ?? 0;
        } else {
          // Could be a formula from a previous breakdown group - find it in results
          const formulaSerie = results.find(
            (s) =>
              s.definitionIndex === depIndex &&
              'type' in s.definition &&
              s.definition.type === 'formula' &&
              s.name.slice(1).join(':::') === breakdownSignature,
          );
          if (formulaSerie) {
            const totalCount = formulaSerie.data.find(
              (d) => d.total_count != null,
            )?.total_count;
            totalCountScope[readableId] = totalCount ?? 0;
          } else {
            totalCountScope[readableId] = 0;
          }
        }
      });

      // Evaluate formula for total_count
      let formulaTotalCount: number | undefined;
      try {
        const result = mathjs
          .parse(formula.formula)
          .compile()
          .evaluate(totalCountScope) as number;
        formulaTotalCount =
          Number.isNaN(result) || !Number.isFinite(result)
            ? undefined
            : round(result, 2);
      } catch (error) {
        formulaTotalCount = undefined;
      }

      // Calculate formula for each date
      const formulaData = sortedDates.map((date) => {
        const scope: Record<string, number> = {};

        // Build scope using alphabet IDs (A, B, C, etc.)
        definitions.slice(0, formulaIndex).forEach((depDef, depIndex) => {
          const readableId = alphabetIds[depIndex];
          if (!readableId) {
            return;
          }

          // Find the series for this dependency in the current breakdown group
          const depSeries = seriesByIndex.get(depIndex);
          if (depSeries) {
            const dataPoint = depSeries.data.find((d) => d.date === date);
            scope[readableId] = dataPoint?.count ?? 0;
          } else {
            // Could be a formula from a previous breakdown group - find it in results
            // Match by definitionIndex AND breakdown signature
            const formulaSerie = results.find(
              (s) =>
                s.definitionIndex === depIndex &&
                'type' in s.definition &&
                s.definition.type === 'formula' &&
                s.name.slice(1).join(':::') === breakdownSignature,
            );
            if (formulaSerie) {
              const dataPoint = formulaSerie.data.find((d) => d.date === date);
              scope[readableId] = dataPoint?.count ?? 0;
            } else {
              scope[readableId] = 0;
            }
          }
        });

        // Evaluate formula
        let count: number;
        try {
          count = mathjs
            .parse(formula.formula)
            .compile()
            .evaluate(scope) as number;
        } catch (error) {
          count = 0;
        }

        return {
          date,
          count:
            Number.isNaN(count) || !Number.isFinite(count)
              ? 0
              : round(count, 2),
          total_count: formulaTotalCount,
        };
      });

      // Create concrete series for this formula
      const templateSerie = breakdownSeries[0]!;

      // Extract breakdown values from template series name
      // name[0] is event/formula name, name[1+] are breakdown values
      const breakdownValues =
        templateSerie.name.length > 1 ? templateSerie.name.slice(1) : [];

      const formulaName =
        breakdownValues.length > 0
          ? [formula.displayName || formula.formula, ...breakdownValues]
          : [formula.displayName || formula.formula];

      const formulaSeries: ConcreteSeries = {
        id: `formula-${formula.id ?? formulaIndex}-${breakdownSignature || 'default'}`,
        definitionId:
          formula.id ?? alphabetIds[formulaIndex] ?? `formula-${formulaIndex}`,
        definitionIndex: formulaIndex,
        name: formulaName,
        context: {
          filters: templateSerie.context.filters,
          breakdownValue: templateSerie.context.breakdownValue,
          breakdowns: templateSerie.context.breakdowns,
        },
        data: formulaData,
        definition: formula,
      };

      results.push(formulaSeries);
    }
  });

  return results;
}
