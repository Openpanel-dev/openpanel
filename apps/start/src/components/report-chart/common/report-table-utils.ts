import { getPropertyLabel } from '@/translations/properties';
import type { IChartData } from '@/trpc/client';

export type TableRow = {
  id: string;
  serieId: string; // Serie ID for visibility/color lookup
  serieName: string;
  breakdownValues: string[];
  count: number;
  sum: number;
  average: number;
  min: number;
  max: number;
  dateValues: Record<string, number>; // date -> count
  groupKey?: string;
  parentGroupKey?: string;
  isSummaryRow?: boolean;
};

export type GroupedTableRow = TableRow & {
  // For grouped mode, indicates which breakdown levels should show empty cells
  breakdownDisplay: (string | null)[]; // null means show empty cell
};

/** Row type that supports TanStack Table's expanding feature. */
export type ExpandableTableRow = TableRow & {
  subRows?: ExpandableTableRow[];
  isGroupHeader?: boolean;
  groupValue?: string;
  groupLevel?: number; // 0-based
  breakdownDisplay?: (string | null)[];
};

/** Hierarchical group structure for collapse/expand. */
export type GroupedItem<T> = {
  group: string;
  items: Array<GroupedItem<T> | T>;
  level: number;
  groupKey: string; // path-based
  parentGroupKey?: string;
};

/** Transform a flat array with hierarchical names into a nested group tree. */
export function groupByNames<T extends { names: string[] }>(
  items: T[]
): Array<GroupedItem<T>> {
  const rootGroups = new Map<string, GroupedItem<T>>();

  for (const item of items) {
    const names = item.names;
    if (names.length === 0) {
      continue;
    }

    // Start with the first level (serie name, level -1)
    const firstLevel = names[0]!;
    const rootGroupKey = firstLevel;

    if (!rootGroups.has(firstLevel)) {
      rootGroups.set(firstLevel, {
        group: firstLevel,
        items: [],
        level: -1, // Serie level
        groupKey: rootGroupKey,
      });
    }

    const rootGroup = rootGroups.get(firstLevel)!;

    // Navigate/create nested groups for remaining levels (breakdowns, level 0+)
    let currentGroup = rootGroup;
    let parentGroupKey = rootGroupKey;

    for (let i = 1; i < names.length; i++) {
      const levelName = names[i]!;
      const groupKey = `${parentGroupKey}:${levelName}`;
      const level = i - 1; // Breakdown levels start at 0

      const existingGroup = currentGroup.items.find(
        (child): child is GroupedItem<T> =>
          typeof child === 'object' &&
          'group' in child &&
          child.group === levelName &&
          'level' in child &&
          child.level === level
      );

      if (existingGroup) {
        currentGroup = existingGroup;
        parentGroupKey = groupKey;
      } else {
        const newGroup: GroupedItem<T> = {
          group: levelName,
          items: [],
          level,
          groupKey,
          parentGroupKey,
        };
        currentGroup.items.push(newGroup);
        currentGroup = newGroup;
        parentGroupKey = groupKey;
      }
    }

    currentGroup.items.push(item);
  }

  return Array.from(rootGroups.values());
}

/** Flatten a grouped structure back into a flat array of items. */
export function flattenGroupedItems<T>(
  groupedItems: Array<GroupedItem<T> | T>
): T[] {
  const result: T[] = [];

  for (const item of groupedItems) {
    if (item && typeof item === 'object' && 'items' in item) {
      result.push(...flattenGroupedItems(item.items));
    } else if (item) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Find a group by its groupKey in a nested structure
 */
export function findGroup<T>(
  groups: Array<GroupedItem<T>>,
  groupKey: string
): GroupedItem<T> | null {
  for (const group of groups) {
    if (group.groupKey === groupKey) {
      return group;
    }

    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        const found = findGroup([item], groupKey);
        if (found) {
          return found;
        }
      }
    }
  }

  return null;
}

/**
 * Convert hierarchical groups into TanStack Table's flat expandable-row
 * format. The serie level and every breakdown level except the last create
 * group header rows; the last breakdown level is always individual rows.
 */
export function groupsToExpandableRows(
  groups: Array<GroupedItem<TableRow>>,
  breakdownCount: number
): ExpandableTableRow[] {
  const result: ExpandableTableRow[] = [];

  function processGroup(
    group: GroupedItem<TableRow>,
    parentPath: string[] = []
  ): ExpandableTableRow[] {
    const currentPath = [...parentPath, group.group];
    const subRows: ExpandableTableRow[] = [];

    const nestedGroups: GroupedItem<TableRow>[] = [];
    const individualItems: TableRow[] = [];

    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        nestedGroups.push(item);
      } else if (item) {
        individualItems.push(item);
      }
    }

    for (const nestedGroup of nestedGroups) {
      subRows.push(...processGroup(nestedGroup, currentPath));
    }

    // Build breakdownDisplay: the first row shows all breakdown values;
    // subsequent rows show the parent path's values, then the item's own.
    individualItems.forEach((item, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const breakdownValues = item.breakdownValues;

      for (let i = 0; i < breakdownCount; i++) {
        if (index === 0) {
          breakdownDisplay.push(breakdownValues[i] ?? null);
        } else if (i < currentPath.length) {
          breakdownDisplay.push(currentPath[i] ?? null);
        } else if (i < breakdownValues.length) {
          breakdownDisplay.push(breakdownValues[i] ?? null);
        } else {
          breakdownDisplay.push(null);
        }
      }

      subRows.push({
        ...item,
        breakdownDisplay,
        groupKey: group.groupKey,
        parentGroupKey: group.parentGroupKey,
        isGroupHeader: false,
        isSummaryRow: false,
      });
    });

    // Every level groups into a header row except the last breakdown level
    // (level === breakdownCount - 1), which always stays individual rows.
    const shouldCreateGroupHeader =
      subRows.length > 0 &&
      (group.level === -1 || group.level < breakdownCount - 1);

    if (shouldCreateGroupHeader) {
      const groupItems = flattenGroupedItems(group.items);
      const summaryRow = createSummaryRow(
        groupItems,
        group.groupKey,
        breakdownCount
      );

      return [
        {
          ...summaryRow,
          isGroupHeader: true,
          groupValue: group.group,
          groupLevel: group.level,
          subRows,
        },
      ];
    }

    return subRows;
  }

  for (const group of groups) {
    result.push(...processGroup(group));
  }

  return result;
}

/**
 * Convert hierarchical groups to flat table rows, respecting collapsed groups
 * This creates GroupedTableRow entries with proper breakdownDisplay values
 * @deprecated Use groupsToExpandableRows with TanStack Table's expanding feature instead
 */
export function groupsToTableRows<T extends TableRow>(
  groups: Array<GroupedItem<T>>,
  collapsedGroups: Set<string>,
  breakdownCount: number
): GroupedTableRow[] {
  const rows: GroupedTableRow[] = [];

  function processGroup(
    group: GroupedItem<T>,
    parentPath: string[] = [],
    parentGroupKey?: string
  ): void {
    const isGroupCollapsed = collapsedGroups.has(group.groupKey);
    const currentPath = [...parentPath, group.group];

    if (isGroupCollapsed) {
      const groupItems = flattenGroupedItems(group.items);
      if (groupItems.length > 0) {
        const summaryRow = createSummaryRow(
          groupItems,
          group.groupKey,
          breakdownCount
        );
        rows.push(summaryRow);
      }
      return;
    }

    const nestedGroups: GroupedItem<T>[] = [];
    const actualItems: T[] = [];

    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        nestedGroups.push(item);
      } else if (item) {
        actualItems.push(item);
      }
    }

    actualItems.forEach((item, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const breakdownValues = item.breakdownValues;

      if (index === 0) {
        for (let i = 0; i < breakdownCount; i++) {
          breakdownDisplay.push(breakdownValues[i] ?? null);
        }
      } else {
        for (let i = 0; i < breakdownCount; i++) {
          if (i < currentPath.length) {
            breakdownDisplay.push(currentPath[i] ?? null);
          } else if (i < breakdownValues.length) {
            breakdownDisplay.push(breakdownValues[i] ?? null);
          } else {
            breakdownDisplay.push(null);
          }
        }
      }

      rows.push({
        ...item,
        breakdownDisplay,
        groupKey: group.groupKey,
        parentGroupKey: group.parentGroupKey,
      });
    });

    for (const nestedGroup of nestedGroups) {
      processGroup(nestedGroup, currentPath, group.groupKey);
    }
  }

  for (const group of groups) {
    processGroup(group);
  }

  return rows;
}

/** Extract unique dates from all series. */
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
 * Get breakdown property names from series. Breakdown values live in
 * names.slice(1), so the property names have to be inferred from the
 * breakdowns array or from the series structure.
 */
function getBreakdownPropertyNames(
  series: IChartData['series'],
  breakdowns: Array<{ name: string }>
): string[] {
  if (breakdowns.length > 0) {
    return breakdowns.map((b) => getPropertyLabel(b.name));
  }

  // All series should have the same number of breakdown values
  if (series.length === 0) {
    return [];
  }
  const firstSerie = series[0];
  const breakdownCount = firstSerie.names.length - 1;
  return Array.from({ length: breakdownCount }, (_, i) => `Breakdown ${i + 1}`);
}

/**
 * Transform series into flat table rows
 */
export function createFlatRows(
  series: IChartData['series'],
  dates: string[]
): TableRow[] {
  return series.map((serie) => {
    const dateValues: Record<string, number> = {};
    dates.forEach((date) => {
      const dataPoint = serie.data.find((d) => d.date === date);
      dateValues[date] = dataPoint?.count ?? 0;
    });

    return {
      id: serie.id,
      serieId: serie.id,
      serieName: serie.names[0] ?? '',
      breakdownValues: serie.names.slice(1),
      count: serie.metrics.count ?? 0,
      sum: serie.metrics.sum,
      average: serie.metrics.average,
      min: serie.metrics.min,
      max: serie.metrics.max,
      dateValues,
    };
  });
}

/** Transform series into hierarchical groups: serie name, then breakdown values. */
export function createGroupedRowsHierarchical(
  series: IChartData['series'],
  dates: string[]
): Array<GroupedItem<TableRow>> {
  const flatRows = createFlatRows(series, dates);

  // Sort by sum descending before grouping
  flatRows.sort((a, b) => b.sum - a.sum);

  const breakdownCount = flatRows[0]?.breakdownValues.length ?? 0;

  if (breakdownCount === 0) {
    // No breakdowns - return empty array (will be handled as flat rows)
    return [];
  }

  // groupByNames expects items with a `names` array; building a temporary
  // one here is a minor inefficiency that keeps groupByNames generic.
  const itemsWithNames = flatRows.map((row) => ({
    ...row,
    names: [row.serieName, ...row.breakdownValues],
  }));

  return groupByNames(itemsWithNames);
}

/**
 * Transform series into grouped table rows (legacy flat format)
 * @deprecated Use createGroupedRowsHierarchical + groupsToTableRows instead
 */
export function createGroupedRows(
  series: IChartData['series'],
  dates: string[]
): GroupedTableRow[] {
  const flatRows = createFlatRows(series, dates);

  flatRows.sort((a, b) => b.sum - a.sum);

  const grouped: GroupedTableRow[] = [];
  const breakdownCount = flatRows[0]?.breakdownValues.length ?? 0;

  if (breakdownCount === 0) {
    return flatRows.map((row) => ({
      ...row,
      breakdownDisplay: [],
    }));
  }

  const groupsByFirstBreakdown = new Map<string, TableRow[]>();
  flatRows.forEach((row) => {
    const firstBreakdown = row.breakdownValues[0] ?? '';
    if (!groupsByFirstBreakdown.has(firstBreakdown)) {
      groupsByFirstBreakdown.set(firstBreakdown, []);
    }
    groupsByFirstBreakdown.get(firstBreakdown)!.push(row);
  });

  const sortedGroups = Array.from(groupsByFirstBreakdown.entries()).sort(
    (a, b) => {
      const aMax = Math.max(...a[1].map((r) => r.sum));
      const bMax = Math.max(...b[1].map((r) => r.sum));
      return bMax - aMax;
    }
  );

  sortedGroups.forEach(([firstBreakdownValue, groupRows]) => {
    groupRows.sort((a, b) => b.sum - a.sum);

    const groupKey = firstBreakdownValue;

    groupRows.forEach((row, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const firstRow = groupRows[0]!;

      if (index === 0) {
        breakdownDisplay.push(...row.breakdownValues);
      } else {
        // Always show the value, even if it matches the first row.
        for (let i = 0; i < row.breakdownValues.length; i++) {
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

/** Create a summary row for a collapsed group. */
export function createSummaryRow(
  groupRows: TableRow[],
  groupKey: string,
  breakdownCount: number
): GroupedTableRow {
  const firstRow = groupRows[0]!;

  const totalSum = groupRows.reduce((sum, row) => sum + row.sum, 0);
  const totalCount = groupRows.reduce((sum, row) => sum + row.count, 0);
  const totalAverage =
    groupRows.reduce((sum, row) => sum + row.average, 0) / groupRows.length;
  const totalMin = Math.min(...groupRows.map((row) => row.min));
  const totalMax = Math.max(...groupRows.map((row) => row.max));

  const dateValues: Record<string, number> = {};
  groupRows.forEach((row) => {
    Object.keys(row.dateValues).forEach((date) => {
      dateValues[date] = (dateValues[date] ?? 0) + row.dateValues[date];
    });
  });

  // Build breakdownDisplay: show first breakdown value, rest are null
  const breakdownDisplay: (string | null)[] = [
    firstRow.breakdownValues[0] ?? null,
    ...Array(breakdownCount - 1).fill(null),
  ];

  return {
    id: `summary-${groupKey}`,
    serieId: firstRow.serieId,
    serieName: firstRow.serieName,
    breakdownValues: firstRow.breakdownValues,
    count: totalCount,
    sum: totalSum,
    average: totalAverage,
    min: totalMin,
    max: totalMax,
    dateValues,
    groupKey,
    isSummaryRow: true,
    breakdownDisplay,
  };
}

/** Reorder breakdowns by number of unique values (fewest first). */
function reorderBreakdownsByUniqueCount(
  series: IChartData['series'],
  breakdownPropertyNames: string[]
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

  uniqueCounts.sort((a, b) => a.count - b.count);

  const reorderedNames = uniqueCounts.map(
    (item) => breakdownPropertyNames[item.index]!
  );
  const reorderMap = uniqueCounts.map((item) => item.index); // new index -> old index
  const reverseMap = new Array(breakdownPropertyNames.length);
  reorderMap.forEach((oldIndex, newIndex) => {
    reverseMap[oldIndex] = newIndex;
  });

  return { reorderedNames, reorderMap, reverseMap };
}

/** Transform chart data into table-ready format. */
export function transformToTableData(
  data: IChartData,
  breakdowns: Array<{ name: string }>,
  grouped: boolean
): {
  rows: TableRow[] | GroupedTableRow[];
  dates: string[];
  breakdownPropertyNames: string[];
} {
  const dates = getUniqueDates(data.series);
  const originalBreakdownPropertyNames = getBreakdownPropertyNames(
    data.series,
    breakdowns
  );

  const { reorderedNames: breakdownPropertyNames, reorderMap } =
    reorderBreakdownsByUniqueCount(data.series, originalBreakdownPropertyNames);

  const reorderedSeries = data.series.map((serie) => {
    const reorderedNames = [
      serie.names[0],
      ...reorderMap.map((oldIndex) => serie.names[oldIndex + 1] ?? ''),
    ];
    return {
      ...serie,
      names: reorderedNames,
    };
  });

  const rows = grouped
    ? createGroupedRows(reorderedSeries, dates)
    : createFlatRows(reorderedSeries, dates);

  if (!grouped) {
    (rows as TableRow[]).sort((a, b) => b.sum - a.sum);
  }

  return {
    rows,
    dates,
    breakdownPropertyNames,
  };
}

/** Transform chart data into hierarchical groups. */
export function transformToHierarchicalGroups(
  data: IChartData,
  breakdowns: Array<{ name: string }>
): {
  groups: Array<GroupedItem<TableRow>>;
  dates: string[];
  breakdownPropertyNames: string[];
} {
  const dates = getUniqueDates(data.series);
  const originalBreakdownPropertyNames = getBreakdownPropertyNames(
    data.series,
    breakdowns
  );

  const { reorderedNames: breakdownPropertyNames, reorderMap } =
    reorderBreakdownsByUniqueCount(data.series, originalBreakdownPropertyNames);

  const reorderedSeries = data.series.map((serie) => {
    const reorderedNames = [
      serie.names[0],
      ...reorderMap.map((oldIndex) => serie.names[oldIndex + 1] ?? ''),
    ];
    return {
      ...serie,
      names: reorderedNames,
    };
  });

  const groups = createGroupedRowsHierarchical(reorderedSeries, dates);

  return {
    groups,
    dates,
    breakdownPropertyNames,
  };
}
