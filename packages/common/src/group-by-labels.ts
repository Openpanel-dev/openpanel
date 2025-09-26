export interface ISerieDataItem {
  label_0: string | null | undefined;
  label_1?: string | null | undefined;
  label_2?: string | null | undefined;
  label_3?: string | null | undefined;
  count: number;
  date: string;
}

interface GroupedDataPoint {
  date: string;
  count: number;
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
    });
  });

  const result = Array.from(groupedMap.values()).map((group) => ({
    ...group,
    data: group.data.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    ),
  }));

  return result
    .filter((group) => group.name.length > 0)
    .map((group) => {
      return {
        ...group,
        // This will ensure that all dates are present in the data array
        data: Array.from(timestamps).map((date) => {
          const dataPoint = group.data.find((dp) => dp.date === date);
          return dataPoint || { date, count: 0 };
        }),
      };
    });
}
