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
 * Row type that supports TanStack Table's expanding feature
 * Can represent both group header rows and data rows
 */
export type ExpandableTableRow = TableRow & {
  subRows?: ExpandableTableRow[];
  isGroupHeader?: boolean; // True if this is a group header row
  groupValue?: string; // The value this group represents
  groupLevel?: number; // The level in the hierarchy (0-based)
  breakdownDisplay?: (string | null)[]; // For display purposes
};

/**
 * Hierarchical group structure for better collapse/expand functionality
 */
export type GroupedItem<T> = {
  group: string;
  items: Array<GroupedItem<T> | T>;
  level: number;
  groupKey: string; // Unique key for this group (path-based)
  parentGroupKey?: string; // Key of parent group
};

/**
 * Transform flat array of items with hierarchical names into nested group structure
 * This creates a tree structure that makes it easier to toggle specific groups
 */
export function groupByNames<T extends { names: string[] }>(
  items: T[],
): Array<GroupedItem<T>> {
  const rootGroups = new Map<string, GroupedItem<T>>();

  for (const item of items) {
    const names = item.names;
    if (names.length === 0) continue;

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

      // Find existing group at this level
      const existingGroup = currentGroup.items.find(
        (child): child is GroupedItem<T> =>
          typeof child === 'object' &&
          'group' in child &&
          child.group === levelName &&
          'level' in child &&
          child.level === level,
      );

      if (existingGroup) {
        currentGroup = existingGroup;
        parentGroupKey = groupKey;
      } else {
        // Create new group at this level
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

    // Add the actual item to the deepest group
    currentGroup.items.push(item);
  }

  return Array.from(rootGroups.values());
}

/**
 * Flatten a grouped structure back into a flat array of items
 * Useful for getting all items in a group or its children
 */
export function flattenGroupedItems<T>(
  groupedItems: Array<GroupedItem<T> | T>,
): T[] {
  const result: T[] = [];

  for (const item of groupedItems) {
    if (item && typeof item === 'object' && 'items' in item) {
      // It's a group, recursively flatten its items
      result.push(...flattenGroupedItems(item.items));
    } else if (item) {
      // It's an actual item
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
  groupKey: string,
): GroupedItem<T> | null {
  for (const group of groups) {
    if (group.groupKey === groupKey) {
      return group;
    }

    // Search in nested groups
    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        const found = findGroup([item], groupKey);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Convert hierarchical groups to TanStack Table's expandable row format
 * This creates rows with subRows that TanStack Table can expand/collapse natively
 */
export function groupsToExpandableRows(
  groups: Array<GroupedItem<TableRow>>,
  breakdownCount: number,
): ExpandableTableRow[] {
  const result: ExpandableTableRow[] = [];

  function processGroup(
    group: GroupedItem<TableRow>,
    parentPath: string[] = [],
  ): ExpandableTableRow[] {
    const currentPath = [...parentPath, group.group];
    const subRows: ExpandableTableRow[] = [];

    // Separate nested groups from actual items
    const nestedGroups: GroupedItem<TableRow>[] = [];
    const actualItems: TableRow[] = [];

    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        nestedGroups.push(item);
      } else if (item) {
        actualItems.push(item);
      }
    }

    // Process nested groups (they become subRows)
    for (const nestedGroup of nestedGroups) {
      subRows.push(...processGroup(nestedGroup, currentPath));
    }

    // Process actual items
    actualItems.forEach((item, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const breakdownValues = item.breakdownValues;

      // Build breakdownDisplay based on hierarchy
      if (index === 0) {
        // First row shows all breakdown values
        for (let i = 0; i < breakdownCount; i++) {
          breakdownDisplay.push(breakdownValues[i] ?? null);
        }
      } else {
        // Subsequent rows: show values from parent path, then item values
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

      subRows.push({
        ...item,
        breakdownDisplay,
        groupKey: group.groupKey,
        parentGroupKey: group.parentGroupKey,
        // Explicitly mark as NOT a group header or summary row
        isGroupHeader: false,
        isSummaryRow: false,
      });
    });

    // If this group has subRows and is not the last breakdown level, create a group header row
    // Don't create group headers for the last breakdown level (level === breakdownCount)
    // because it would just duplicate the rows
    const shouldCreateGroupHeader =
      subRows.length > 0 &&
      (group.level < breakdownCount || group.level === -1); // -1 is serie level

    if (shouldCreateGroupHeader) {
      // Create a summary row for the group
      const groupItems = flattenGroupedItems(group.items);
      const summaryRow = createSummaryRow(
        groupItems,
        group.groupKey,
        breakdownCount,
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
  breakdownCount: number,
): GroupedTableRow[] {
  const rows: GroupedTableRow[] = [];

  function processGroup(
    group: GroupedItem<T>,
    parentPath: string[] = [],
    parentGroupKey?: string,
  ): void {
    const isGroupCollapsed = collapsedGroups.has(group.groupKey);
    const currentPath = [...parentPath, group.group];

    if (isGroupCollapsed) {
      // Group is collapsed - add summary row
      const groupItems = flattenGroupedItems(group.items);
      if (groupItems.length > 0) {
        const summaryRow = createSummaryRow(
          groupItems,
          group.groupKey,
          breakdownCount,
        );
        rows.push(summaryRow);
      }
      return;
    }

    // Group is expanded - process items
    // Separate nested groups from actual items
    const nestedGroups: GroupedItem<T>[] = [];
    const actualItems: T[] = [];

    for (const item of group.items) {
      if (item && typeof item === 'object' && 'items' in item) {
        nestedGroups.push(item);
      } else if (item) {
        actualItems.push(item);
      }
    }

    // Process actual items first
    actualItems.forEach((item, index) => {
      const breakdownDisplay: (string | null)[] = [];
      const breakdownValues = item.breakdownValues;

      // For the first item in the group, show all breakdown values
      // For subsequent items, show values based on hierarchy
      if (index === 0) {
        // First row shows all breakdown values
        for (let i = 0; i < breakdownCount; i++) {
          breakdownDisplay.push(breakdownValues[i] ?? null);
        }
      } else {
        // Subsequent rows: show values from parent path, then item values
        for (let i = 0; i < breakdownCount; i++) {
          if (i < currentPath.length) {
            // Show value from parent group path
            breakdownDisplay.push(currentPath[i] ?? null);
          } else if (i < breakdownValues.length) {
            // Show current breakdown value from the item
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

    // Process nested groups
    for (const nestedGroup of nestedGroups) {
      processGroup(nestedGroup, currentPath, group.groupKey);
    }
  }

  for (const group of groups) {
    processGroup(group);
  }

  return rows;
}

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
 * Transform series into hierarchical groups
 * Uses the new groupByNames function for better structure
 * Groups by serie name first, then by breakdown values
 */
export function createGroupedRowsHierarchical(
  series: IChartData['series'],
  dates: string[],
): Array<GroupedItem<TableRow>> {
  const flatRows = createFlatRows(series, dates);

  // Sort by sum descending before grouping
  flatRows.sort((a, b) => b.sum - a.sum);

  const breakdownCount = flatRows[0]?.breakdownValues.length ?? 0;

  if (breakdownCount === 0) {
    // No breakdowns - return empty array (will be handled as flat rows)
    return [];
  }

  // Create hierarchical groups using groupByNames
  // Group by serie name first, then by breakdown values
  const itemsWithNames = flatRows.map((row) => ({
    ...row,
    names: [row.serieName, ...row.breakdownValues], // Serie name + breakdown values
  }));

  return groupByNames(itemsWithNames);
}

/**
 * Transform series into grouped table rows (legacy flat format)
 * Groups rows hierarchically by breakdown values
 * @deprecated Use createGroupedRowsHierarchical + groupsToTableRows instead
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

/**
 * Transform chart data into hierarchical groups
 * Returns hierarchical structure for better group management
 */
export function transformToHierarchicalGroups(
  data: IChartData,
  breakdowns: Array<{ name: string }>,
): {
  groups: Array<GroupedItem<TableRow>>;
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

  const groups = createGroupedRowsHierarchical(reorderedSeries, dates);

  return {
    groups,
    dates,
    breakdownPropertyNames,
  };
}
