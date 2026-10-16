import { round } from '@openpanel/shared';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getLabelNames } from '../common/label-names';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { BarLabels } from './bar-labels';
import { Bar } from '@/components/charts/bar';
import { BarChart } from '@/components/charts/bar-chart';
import { OPChartTooltip } from '@/components/charts/op-tooltip';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useElementSize } from '@/hooks/use-element-size';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const DEFAULT_ROWS = 10;
const ALL_SERIES_LIMIT = 500;
export const ROW_HEIGHT = 36;
const MORE_ROW_HEIGHT = 28;
const BAR_GAP = 0.35;
const LABEL_SHARE = 0.4;
const LABEL_MAX_WIDTH = 260;
const VALUE_WIDTH = 96;
const BAR_COLOR = getChartColor(0);
const PREVIOUS_BAR_COLOR = `color-mix(in oklch, ${BAR_COLOR} 30%, transparent)`;

const SORT_OPTIONS = {
  'count-desc': 'Count (High → Low)',
  'count-asc': 'Count (Low → High)',
  'name-asc': 'Name (A → Z)',
  'name-desc': 'Name (Z → A)',
} as const;
type SortOption = keyof typeof SORT_OPTIONS;

// The index signature lets rows go straight into bklit's chart data.
export interface BarRow {
  [key: string]: unknown;
  id: string;
  names: string[];
  /** `names` without the event name when every row shares it. */
  labelNames: string[];
  count: number;
  previous?: number;
  previousDiff?: { diff: number | null; state: string };
  share: number;
}

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('count-desc');
  const {
    isEditMode,
    layout,
    report: { metric, limit, previous },
  } = useReportChartContext();
  const isTile = layout === 'fill';
  const [sizeRef, { width, height }] = useElementSize();
  const { series } = useVisibleSeries(data, { limit: ALL_SERIES_LIMIT });
  const total = data.metrics.sum || 1;

  const rows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = query
      ? series.filter((serie) =>
          serie.names.some((name) => name.toLowerCase().includes(query))
        )
      : series;
    const labelNames = getLabelNames(series);
    return sortSeries(matching, sortBy).map(
      (serie): BarRow => ({
        id: serie.id,
        names: serie.names,
        labelNames: labelNames(serie.names),
        count: serie.metrics.sum,
        previous: previous
          ? serie.metrics.previous?.[metric]?.value
          : undefined,
        previousDiff: previous ? serie.metrics.previous?.[metric] : undefined,
        share: round((serie.metrics.sum / total) * 100, 1),
      })
    );
  }, [series, searchQuery, sortBy, previous, metric, total]);

  const rowLimit = (() => {
    if (isEditMode) {
      return rows.length;
    }
    // A tile shows the whole rows that fit its height; a saved limit still caps it.
    if (isTile) {
      const fitting = Math.floor(height / ROW_HEIGHT);
      const fittingWithMore = Math.floor(
        (height - MORE_ROW_HEIGHT) / ROW_HEIGHT
      );
      const fits = Math.min(rows.length, limit ?? Number.POSITIVE_INFINITY);
      return fits <= fitting ? fits : Math.max(1, fittingWithMore);
    }
    return limit || DEFAULT_ROWS;
  })();
  const visibleRows = rows.slice(0, rowLimit);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className={cn('col w-full', isEditMode && 'card', isTile && 'h-full')}>
      {isEditMode && (
        <BarToolbar
          onSearch={setSearchQuery}
          onSort={setSortBy}
          searchQuery={searchQuery}
          sortBy={sortBy}
        />
      )}
      <div
        className={cn(
          'w-full',
          isTile && 'min-h-0 flex-1',
          isEditMode && 'p-4'
        )}
        data-report-chart="bar"
        ref={sizeRef}
      >
        {width > 0 && visibleRows.length > 0 && (
          <BarRows previous={previous} rows={visibleRows} width={width} />
        )}
        {hiddenCount > 0 && (
          <div
            className="flex items-center px-1 text-muted-foreground text-sm"
            style={{ height: MORE_ROW_HEIGHT }}
          >
            +{hiddenCount} more
          </div>
        )}
      </div>
    </div>
  );
}

function BarRows({
  rows,
  width,
  previous,
}: {
  rows: BarRow[];
  width: number;
  previous: boolean | undefined;
}) {
  const labelWidth = Math.min(width * LABEL_SHARE, LABEL_MAX_WIDTH);
  // An empty previous bar would still take half of every row.
  const hasPrevious = previous && rows.some((row) => (row.previous ?? 0) > 0);
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );

  return (
    <div style={{ height: rows.length * ROW_HEIGHT }}>
      <BarChart
        animationDuration={0}
        aspectRatio="auto"
        barGap={BAR_GAP}
        className="h-full"
        data={rows}
        margin={{ top: 0, right: VALUE_WIDTH, bottom: 0, left: labelWidth }}
        orientation="horizontal"
        xDataKey="id"
      >
        <Bar animate={false} dataKey="count" fill={BAR_COLOR} lineCap={4} />
        {hasPrevious && (
          <Bar
            animate={false}
            dataKey="previous"
            fill={PREVIOUS_BAR_COLOR}
            lineCap={4}
          />
        )}
        <BarLabels comparesPrevious={Boolean(previous)} rowsById={rowsById} />
        <OPChartTooltip<BarRow>
          datePill={false}
          rows={(row) => [
            {
              color: BAR_COLOR,
              icon: <SerieIcon name={row.labelNames} />,
              label: <SerieName name={row.labelNames} />,
              value: row.count,
              previous: row.previous,
              percentage: row.share,
            },
          ]}
          title={() => null}
        />
      </BarChart>
    </div>
  );
}

function BarToolbar({
  searchQuery,
  onSearch,
  sortBy,
  onSort,
}: {
  searchQuery: string;
  onSearch: (query: string) => void;
  sortBy: SortOption;
  onSort: (sort: SortOption) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-def-200 border-b p-4 dark:border-def-800">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Filter by name"
          size="sm"
          type="text"
          value={searchQuery}
        />
      </div>
      <Select
        onValueChange={(value) => onSort(value as SortOption)}
        value={sortBy}
      >
        <SelectTrigger className="w-[180px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SORT_OPTIONS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function sortSeries<T extends { names: string[]; metrics: { sum: number } }>(
  series: T[],
  sortBy: SortOption
) {
  const byName = (a: T, b: T) =>
    a.names.join(' > ').localeCompare(b.names.join(' > '));
  const compare: Record<SortOption, (a: T, b: T) => number> = {
    'count-desc': (a, b) => b.metrics.sum - a.metrics.sum,
    'count-asc': (a, b) => a.metrics.sum - b.metrics.sum,
    'name-asc': byName,
    'name-desc': (a, b) => byName(b, a),
  };
  return [...series].sort(compare[sortBy]);
}
