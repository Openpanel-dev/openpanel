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

      // Each dependency's points are indexed by date once: a lookup per
      // (date, dependency) would make long minute-level ranges quadratic.
      const dependencies = definitions
        .slice(0, formulaIndex)
        .flatMap((_depDef, depIndex) => {
          const readableId = alphabetIds[depIndex];
          if (!readableId) {
            return [];
          }
          // Could be a formula from a previous breakdown group: match by
          // definitionIndex AND breakdown signature.
          const source =
            seriesByIndex.get(depIndex) ??
            results.find(
              (s) =>
                s.definitionIndex === depIndex &&
                'type' in s.definition &&
                s.definition.type === 'formula' &&
                s.name.slice(1).join(':::') === breakdownSignature
            );
          const countByDate = new Map<string, number>();
          for (const point of source?.data ?? []) {
            if (!countByDate.has(point.date)) {
              countByDate.set(point.date, point.count);
            }
          }
          const totalCount =
            source?.data.find((d) => d.total_count != null)?.total_count ?? 0;
          return [{ readableId, countByDate, totalCount }];
        });

      // total_count is constant across all dates for a breakdown group, so
      // it's computed once here rather than per date.
      const totalCountScope: Record<string, number> = {};
      for (const dependency of dependencies) {
        totalCountScope[dependency.readableId] = dependency.totalCount;
      }

      const totalCountResult = evaluateFormula(
        formula.formula,
        totalCountScope
      );
      const formulaTotalCount =
        totalCountResult === undefined ? undefined : round(totalCountResult, 2);

      const formulaData = sortedDates.map((date) => {
        const scope: Record<string, number> = {};
        for (const dependency of dependencies) {
          scope[dependency.readableId] = dependency.countByDate.get(date) ?? 0;
        }

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
