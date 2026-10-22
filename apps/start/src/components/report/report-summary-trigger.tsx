import type { IChartEventItem } from '@openpanel/core/modules/report/report.constants';
import { alphabetIds } from '@openpanel/core/modules/report/report.constants';
import { GanttChartSquareIcon, PencilIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { useSelector } from '@/redux';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** Series beyond these collapse into a "+N" chip so the control row stays on one line; narrow windows show fewer. */
const VISIBLE_SERIES_WIDE = 2;
const VISIBLE_SERIES_NARROW = 1;

function MoreSeriesChip({
  hidden,
  className,
}: {
  hidden: IChartEventItem[];
  className: string;
}) {
  if (hidden.length === 0) {
    return null;
  }
  return (
    <span
      className={cn(
        'h-7 shrink-0 items-center rounded-md bg-card px-2 font-medium text-muted-foreground shadow-xs',
        className
      )}
      title={hidden.map(seriesLabel).join(', ')}
    >
      +{hidden.length}
    </span>
  );
}

function seriesLabel(serie: IChartEventItem): string {
  if (serie.type === 'formula') {
    return serie.displayName || serie.formula || 'Formula';
  }
  if (serie.displayName) {
    return serie.displayName;
  }
  if (serie.name === '*') {
    return 'Any event';
  }
  return serie.name || 'Select event';
}

function countFilters(series: IChartEventItem[]): number {
  let count = 0;
  for (const serie of series) {
    if (serie.type !== 'event') {
      continue;
    }
    // The synthetic `name` filter is how multi-event series pick their events.
    count += serie.filters.filter((filter) => filter.name !== 'name').length;
  }
  return count;
}

/** Summarises the report's series, filters and breakdowns; opens the builder. */
export const ReportSummaryTrigger = forwardRef<HTMLButtonElement, Props>(
  ({ className, ...props }, ref) => {
    const series = useSelector((state) => state.report.series);
    const globalFilters = useSelector((state) => state.report.globalFilters);
    const breakdowns = useSelector((state) => state.report.breakdowns);

    if (series.length === 0) {
      return (
        <Button
          className={className}
          icon={GanttChartSquareIcon}
          ref={ref}
          variant="cta"
          {...props}
        >
          Pick events
        </Button>
      );
    }

    const filterCount = countFilters(series) + globalFilters.length;
    const details: string[] = [];
    if (filterCount > 0) {
      details.push(
        `${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}`
      );
    }
    if (breakdowns.length > 0) {
      details.push(`by ${breakdowns.map((item) => item.name).join(', ')}`);
    }

    return (
      <button
        className={cn(
          'group flex h-9 min-w-0 items-center gap-1.5 overflow-hidden rounded-lg bg-def-200 py-1 pr-2.5 pl-1 text-left text-sm transition-colors hover:bg-def-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-def-300 dark:hover:bg-def-400/60',
          className
        )}
        ref={ref}
        type="button"
        {...props}
      >
        {series.slice(0, VISIBLE_SERIES_WIDE).map((serie, index) => {
          const isWideOnly = index >= VISIBLE_SERIES_NARROW;
          return (
            <span
              className={cn(
                'h-7 min-w-0 max-w-48 items-center gap-1.5 rounded-md bg-card pr-2 pl-1.5 font-medium shadow-xs',
                isWideOnly ? 'hidden xl:inline-flex' : 'inline-flex'
              )}
              key={serie.id}
            >
              <ColorSquare
                className="h-4 w-4 text-2xs"
                color={getChartColor(index)}
              >
                {alphabetIds[index]}
              </ColorSquare>
              <span className="truncate">{seriesLabel(serie)}</span>
            </span>
          );
        })}
        <MoreSeriesChip
          className="inline-flex xl:hidden"
          hidden={series.slice(VISIBLE_SERIES_NARROW)}
        />
        <MoreSeriesChip
          className="hidden xl:inline-flex"
          hidden={series.slice(VISIBLE_SERIES_WIDE)}
        />
        {details.length > 0 && (
          <span className="hidden min-w-0 truncate whitespace-nowrap px-1 text-muted-foreground xl:inline">
            {details.join(' · ')}
          </span>
        )}
        <PencilIcon
          className="ml-1 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
          size={14}
        />
      </button>
    );
  }
);
ReportSummaryTrigger.displayName = 'ReportSummaryTrigger';
