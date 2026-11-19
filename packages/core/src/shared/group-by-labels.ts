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

const LABEL_PREFIX = 'label_';
const DECIMAL_RADIX = 10;

function labelIndex(key: string): number {
  return Number.parseInt(key.slice(LABEL_PREFIX.length), DECIMAL_RADIX);
}

// An unset value keeps its slot as '' while a later label is set, so name[i]
// is always label_i and the chart engine can map it back to breakdown i.
function rowLabels(row: ISerieDataItem): string[] {
  const labels = Object.entries(row)
    .filter(([key]) => key.startsWith(LABEL_PREFIX))
    .sort(([a], [b]) => labelIndex(a) - labelIndex(b))
    .map(([, value]) => (typeof value === 'string' ? value : ''));
  while (labels.length > 0 && labels.at(-1) === '') {
    labels.pop();
  }
  return labels;
}

export function groupByLabels(data: ISerieDataItem[]): GroupedResult[] {
  const groupedMap = new Map<string, GroupedResult>();
  const timestamps = new Set<string>();
  data.forEach((row) => {
    timestamps.add(row.date);
    const labels = rowLabels(row);

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
  // x-axis. A Map lookup instead of a `.find()` per date: that scan was
  // O(groups x dates x points), and a 12-month chart with three breakdowns
  // reaches 4,640 groups over 365 dates.
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
