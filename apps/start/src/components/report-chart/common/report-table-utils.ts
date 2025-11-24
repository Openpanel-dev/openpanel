import { getPropertyLabel } from '@/translations/properties';
import type { IChartData } from '@/trpc/client';

export type TableRow = {
  id: string;
  serieName: string;
  breakdownValues: string[];
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  dateValues: Record<string, number>; // date -> count
  originalSerie: IChartData['series'][0];
  // Group metadata for collapse functionality
  groupKey?: string; // Unique key for the group this row belongs to
  parentGroupKey?: string; // Key of parent group (for nested groups)
  isSummaryRow?: boolean; // True if this is a summary row for a collapsed group
};

export type GroupedTableRow = TableRow & {
  // For grouped mode, indicates which breakdown levels should show empty cells
  breakdownDisplay: (string | null)[]; // null means show empty cell
};

/**
 * Extract unique dates from all series
 */
function getUniqueDates(series: IChartData['series']): string[] {
  const dateSet = new Set<string>();
  series.forEach((serie) => {
    serie.data.forEach((d) => {
      dateSet.add(d.date);
    });
  });
  return Array.from(dateSet).sort();
}

/**
 * Get breakdown property names from series
 * Breakdown values are in names.slice(1), so we need to infer the property names
 * from the breakdowns array or from the series structure
 */
function getBreakdownPropertyNames(
  series: IChartData['series'],
  breakdowns: Array<{ name: string }>,
): string[] {
  // If we have breakdowns from state, use those
  if (breakdowns.length > 0) {
    return breakdowns.map((b) => getPropertyLabel(b.name));
  }

  // Otherwise, infer from series names
  // All series should have the same number of breakdown values
  if (series.length === 0) return [];
  const firstSerie = series[0];
  const breakdownCount = firstSerie.names.length - 1;
  return Array.from({ length: breakdownCount }, (_, i) => `Breakdown ${i + 1}`);
}

/**
 * Transform series into flat table rows
 */
export function createFlatRows(
  series: IChartData['series'],
  dates: string[],
): TableRow[] {
  return series.map((serie) => {
    const dateValues: Record<string, number> = {};
    dates.forEach((date) => {
      const dataPoint = serie.data.find((d) => d.date === date);
      dateValues[date] = dataPoint?.count ?? 0;
    });

    return {
      id: serie.id,
      serieName: serie.names[0] ?? '',
      breakdownValues: serie.names.slice(1),
      count: serie.metrics.count ?? 0,
      sum: serie.metrics.sum,
      average: serie.metrics.average,
      min: serie.metrics.min,
      max: serie.metrics.max,
      dateValues,
      originalSerie: serie,
    };
  });
}

/**
 * Transform series into grouped table rows
 * Groups rows hierarchically by breakdown values
 */
export function createGroupedRows(
  series: IChartData['series'],
  dates: string[],
): GroupedTableRow[] {
  const flatRows = createFlatRows(series, dates);

  // Sort by sum descending
  flatRows.sort((a, b) => b.sum - a.sum);

  // Group rows by breakdown values hierarchically
  const grouped: GroupedTableRow[] = [];
  const breakdownCount = flatRows[0]?.breakdownValues.length ?? 0;

  if (breakdownCount === 0) {
    // No breakdowns, just return flat rows
    return flatRows.map((row) => ({
      ...row,
      breakdownDisplay: [],
    }));
  }

  // Group rows hierarchically by breakdown values
  // We need to group by parent breakdowns first, then by child breakdowns
  // This creates the nested structure shown in the user's example

  // First, group by first breakdown value
  const groupsByFirstBreakdown = new Map<string, TableRow[]>();
  flatRows.forEach((row) => {
    const firstBreakdown = row.breakdownValues[0] ?? '';
    if (!groupsByFirstBreakdown.has(firstBreakdown)) {
      groupsByFirstBreakdown.set(firstBreakdown, []);
    }
    groupsByFirstBreakdown.get(firstBreakdown)!.push(row);
  });

  // Sort groups by sum of highest row in group
  const sortedGroups = Array.from(groupsByFirstBreakdown.entries()).sort(
    (a, b) => {
      const aMax = Math.max(...a[1].map((r) => r.sum));
      const bMax = Math.max(...b[1].map((r) => r.sum));
      return bMax - aMax;
    },
  );

  // Process each group hierarchically
  sortedGroups.forEach(([firstBreakdownValue, groupRows]) => {
    // Within each first-breakdown group, sort by sum
    groupRows.sort((a, b) => b.sum - a.sum);

    // Generate group key for this first-breakdown group
    const groupKey = firstBreakdownValue;

    // For each row in the group
    groupRows.forEach((row, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const firstRow = groupRows[0]!;

      if (index === 0) {
        // First row shows all breakdown values
        breakdownDisplay.push(...row.breakdownValues);
      } else {
        // Subsequent rows: show all values, but mark duplicates for muted styling
        for (let i = 0; i < row.breakdownValues.length; i++) {
          // Always show the value, even if it matches the first row
          breakdownDisplay.push(row.breakdownValues[i] ?? null);
        }
      }

      grouped.push({
        ...row,
        breakdownDisplay,
        groupKey,
      });
    });
  });

  return grouped;
}

/**
 * Create a summary row for a collapsed group
 */
export function createSummaryRow(
  groupRows: TableRow[],
  groupKey: string,
  breakdownCount: number,
): GroupedTableRow {
  // Aggregate metrics from all rows in the group
  const totalSum = groupRows.reduce((sum, row) => sum + row.sum, 0);
  const totalCount = groupRows.reduce((sum, row) => sum + row.count, 0);
  const totalAverage =
    groupRows.reduce((sum, row) => sum + row.average, 0) / groupRows.length;
  const totalMin = Math.min(...groupRows.map((row) => row.min));
  const totalMax = Math.max(...groupRows.map((row) => row.max));

  // Aggregate date values
  const dateValues: Record<string, number> = {};
  const allDates = new Set<string>();
  groupRows.forEach((row) => {
    Object.keys(row.dateValues).forEach((date) => {
      allDates.add(date);
      dateValues[date] = (dateValues[date] ?? 0) + row.dateValues[date];
    });
  });

  // Get breakdown values from first row
  const firstRow = groupRows[0]!;
  const breakdownDisplay: (string | null)[] = [];
  breakdownDisplay.push(firstRow.breakdownValues[0] ?? null);
  // Fill remaining breakdowns with null (empty)
  for (let i = 1; i < breakdownCount; i++) {
    breakdownDisplay.push(null);
  }

  return {
    id: `summary-${groupKey}`,
    serieName: firstRow.serieName,
    breakdownValues: firstRow.breakdownValues,
    count: totalCount,
    sum: totalSum,
    average: totalAverage,
    min: totalMin,
    max: totalMax,
    dateValues,
    originalSerie: firstRow.originalSerie,
    groupKey,
    isSummaryRow: true,
    breakdownDisplay,
  };
}

/**
 * Reorder breakdowns by number of unique values (fewest first)
 */
function reorderBreakdownsByUniqueCount(
  series: IChartData['series'],
  breakdownPropertyNames: string[],
): {
  reorderedNames: string[];
  reorderMap: number[]; // Maps new index -> old index
  reverseMap: number[]; // Maps old index -> new index
} {
  if (breakdownPropertyNames.length === 0 || series.length === 0) {
    return {
      reorderedNames: breakdownPropertyNames,
      reorderMap: [],
      reverseMap: [],
    };
  }

  // Count unique values for each breakdown index
  const uniqueCounts = breakdownPropertyNames.map((_, index) => {
    const uniqueValues = new Set<string>();
    series.forEach((serie) => {
      const value = serie.names[index + 1]; // +1 because names[0] is serie name
      if (value) {
        uniqueValues.add(value);
      }
    });
    return { index, count: uniqueValues.size };
  });

  // Sort by count (ascending - fewest first)
  uniqueCounts.sort((a, b) => a.count - b.count);

  // Create reordered names and mapping
  const reorderedNames = uniqueCounts.map(
    (item) => breakdownPropertyNames[item.index]!,
  );
  const reorderMap = uniqueCounts.map((item) => item.index); // new index -> old index
  const reverseMap = new Array(breakdownPropertyNames.length);
  reorderMap.forEach((oldIndex, newIndex) => {
    reverseMap[oldIndex] = newIndex;
  });

  return { reorderedNames, reorderMap, reverseMap };
}

/**
 * Transform chart data into table-ready format
 */
export function transformToTableData(
  data: IChartData,
  breakdowns: Array<{ name: string }>,
  grouped: boolean,
): {
  rows: TableRow[] | GroupedTableRow[];
  dates: string[];
  breakdownPropertyNames: string[];
} {
  const dates = getUniqueDates(data.series);
  const originalBreakdownPropertyNames = getBreakdownPropertyNames(
    data.series,
    breakdowns,
  );

  // Reorder breakdowns by unique count (fewest first)
  const { reorderedNames: breakdownPropertyNames, reorderMap } =
    reorderBreakdownsByUniqueCount(data.series, originalBreakdownPropertyNames);

  // Reorder breakdown values in series before creating rows
  const reorderedSeries = data.series.map((serie) => {
    const reorderedNames = [
      serie.names[0], // Keep serie name first
      ...reorderMap.map((oldIndex) => serie.names[oldIndex + 1] ?? ''), // Reorder breakdown values
    ];
    return {
      ...serie,
      names: reorderedNames,
    };
  });

  const rows = grouped
    ? createGroupedRows(reorderedSeries, dates)
    : createFlatRows(reorderedSeries, dates);

  // Sort flat rows by sum descending
  if (!grouped) {
    (rows as TableRow[]).sort((a, b) => b.sum - a.sum);
  }

  return {
    rows,
    dates,
    breakdownPropertyNames,
  };
}
