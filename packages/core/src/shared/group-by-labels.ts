// Moved from packages/common/src/group-by-labels.ts (M11-006, ADR-007 shared/
// layout). Sole consumer: modules/chart/src/engine/fetch.ts.
export interface ISerieDataItem {
  label_0: string | null | undefined;
  label_1?: string | null | undefined;
  label_2?: string | null | undefined;
  label_3?: string | null | undefined;
  count: number;
  total_count?: number;
  date: string;
}

interface GroupedDataPoint {
  date: string;
  count: number;
  total_count?: number;
}

interface GroupedResult {
  name: string[]; // [label_0, label_1, label_2, label_3]
  data: GroupedDataPoint[];
}

export function groupByLabels(data: ISerieDataItem[]): GroupedResult[] {
  const groupedMap = new Map<string, GroupedResult>();
  const timestamps = new Set<string>();
  data.forEach((row) => {
    timestamps.add(row.date);
    const labels = Object.keys(row)
      .filter((key) => key.startsWith('label_'))
      .sort((a, b) => {
        const numA = Number.parseInt(a.replace('label_', ''));
        const numB = Number.parseInt(b.replace('label_', ''));
        return numA - numB;
      })
      .map((key) => (row as any)[key])
      .filter((label): label is string => !!label);

    const labelKey = labels.join(':::');

    if (!groupedMap.has(labelKey)) {
      groupedMap.set(labelKey, {
        name: labels,
        data: [],
      });
    }

    const group = groupedMap.get(labelKey)!;
    group.data.push({
      date: row.date,
      count: row.count,
      total_count: row.total_count,
    });
  });

  const result = Array.from(groupedMap.values()).map((group) => ({
    ...group,
    data: group.data.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    ),
  }));

  // Every group is padded to the full set of dates so all series share an
  // x-axis. The lookup is a Map rather than a `.find()` per date: that scan
  // was O(groups x dates x points), and a 12-month chart with three
  // breakdowns reaches 4,640 groups over 365 dates. The OUTPUT is unchanged —
  // same dates, same order, same zero-filled points.
  const allDates = Array.from(timestamps);
  return result
    .filter((group) => group.name.length > 0)
    .map((group) => {
      const byDate = new Map(group.data.map((dp) => [dp.date, dp]));
      return {
        ...group,
        data: allDates.map(
          (date) => byDate.get(date) ?? { date, count: 0, total_count: 0 }
        ),
      };
    });
}
