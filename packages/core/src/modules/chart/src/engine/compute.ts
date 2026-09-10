import { round } from '@openpanel/shared';
import type { IChartFormula } from '../../../report/report.constants';
import { alphabetIds } from '../../../report/report.constants';
import { evaluateFormula } from './formula';
import type { ConcreteSeries } from './types';

/** Formulas reference the event series by alphabet ID (A, B, C, ...). */
export function compute(
  fetchedSeries: ConcreteSeries[],
  definitions: Array<{
    type: 'event' | 'formula';
    id?: string;
    formula?: string;
  }>
): ConcreteSeries[] {
  const results: ConcreteSeries[] = [...fetchedSeries];

  // In definition order: a formula may reference an earlier formula.
  definitions.forEach((definition, formulaIndex) => {
    if (definition.type !== 'formula') {
      return;
    }

    const formula = definition as IChartFormula;
    if (!formula.formula) {
      return;
    }

    // Series sharing a breakdown signature are computed together. `results`
    // opens as a copy of `fetchedSeries`, so only the formulas earlier
    // iterations appended still need adding.
    const seriesByBreakdown = new Map<string, ConcreteSeries[]>();

    const allSeries = [
      ...fetchedSeries,
      ...results.filter(
        (serie) =>
          serie.definitionIndex < formulaIndex && !fetchedSeries.includes(serie)
      ),
    ];

    allSeries.forEach((serie) => {
      // name[0] is the event/formula name; name[1+] are the breakdown values.
      const breakdownSignature =
        serie.name.length > 1 ? serie.name.slice(1).join(':::') : '';

      if (!seriesByBreakdown.has(breakdownSignature)) {
        seriesByBreakdown.set(breakdownSignature, []);
      }
      seriesByBreakdown.get(breakdownSignature)!.push(serie);
    });

    for (const [breakdownSignature, breakdownSeries] of seriesByBreakdown) {
      const seriesByIndex = new Map<number, ConcreteSeries>();
      breakdownSeries.forEach((serie) => {
        seriesByIndex.set(serie.definitionIndex, serie);
      });

      const allDates = new Set<string>();
      breakdownSeries.forEach((serie) => {
        serie.data.forEach((item) => {
          allDates.add(item.date);
        });
      });

      const sortedDates = Array.from(allDates).sort(
        (a, b) => new Date(a).getTime() - new Date(b).getTime()
      );

      // Calculate total_count for the formula using the same formula applied to input series' total_count values
      // total_count is constant across all dates for a breakdown group, so compute it once
      const totalCountScope: Record<string, number> = {};
      definitions.slice(0, formulaIndex).forEach((_depDef, depIndex) => {
        const readableId = alphabetIds[depIndex];
        if (!readableId) {
          return;
        }

        // Find the series for this dependency in the current breakdown group
        const depSeries = seriesByIndex.get(depIndex);
        if (depSeries) {
          // Get total_count from any data point (it's the same for all dates)
          const totalCount = depSeries.data.find(
            (d) => d.total_count != null
          )?.total_count;
          totalCountScope[readableId] = totalCount ?? 0;
        } else {
          // Could be a formula from a previous breakdown group - find it in results
          const formulaSerie = results.find(
            (s) =>
              s.definitionIndex === depIndex &&
              'type' in s.definition &&
              s.definition.type === 'formula' &&
              s.name.slice(1).join(':::') === breakdownSignature
          );
          if (formulaSerie) {
            const totalCount = formulaSerie.data.find(
              (d) => d.total_count != null
            )?.total_count;
            totalCountScope[readableId] = totalCount ?? 0;
          } else {
            totalCountScope[readableId] = 0;
          }
        }
      });

      // Evaluate formula for total_count
      const totalCountResult = evaluateFormula(
        formula.formula,
        totalCountScope
      );
      const formulaTotalCount =
        totalCountResult === undefined ? undefined : round(totalCountResult, 2);

      // Calculate formula for each date
      const formulaData = sortedDates.map((date) => {
        const scope: Record<string, number> = {};

        definitions.slice(0, formulaIndex).forEach((_depDef, depIndex) => {
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
                s.name.slice(1).join(':::') === breakdownSignature
            );
            if (formulaSerie) {
              const dataPoint = formulaSerie.data.find((d) => d.date === date);
              scope[readableId] = dataPoint?.count ?? 0;
            } else {
              scope[readableId] = 0;
            }
          }
        });

        const result = evaluateFormula(formula.formula, scope);

        return {
          date,
          count: result === undefined ? 0 : round(result, 2),
          total_count: formulaTotalCount,
        };
      });

      const templateSerie = breakdownSeries[0]!;

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
