import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDateInterval } from '@/hooks/use-format-date-interval';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useSelector } from '@/redux';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { getPreviousMetric } from '@openpanel/common';
import type { SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { ReportTableToolbar } from '../common/report-table-toolbar';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';

interface ConversionTableProps {
  data: RouterOutputs['chart']['conversion'];
  visibleSeries: RouterOutputs['chart']['conversion']['current'];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}

export function ConversionTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ConversionTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const number = useNumber();
  const interval = useSelector((state) => state.report.interval);
  const formatDate = useFormatDateInterval({
    interval,
    short: true,
  });

  // Get all unique dates from the first series
  const dates = useMemo(
    () => data.current[0]?.data.map((item) => item.date) ?? [],
    [data.current],
  );

  // Get all series (including non-visible ones for toggle functionality)
  const allSeries = data.current;

  // Transform data to table rows with memoization
  const rows = useMemo(() => {
    return allSeries.map((serie) => {
      const dateValues: Record<string, number> = {};
      dates.forEach((date) => {
        const item = serie.data.find((d) => d.date === date);
        dateValues[date] = item?.rate ?? 0;
      });

      const total = serie.data.reduce((sum, item) => sum + item.total, 0);
      const conversions = serie.data.reduce(
        (sum, item) => sum + item.conversions,
        0,
      );
      const avgRate =
        serie.data.length > 0
          ? serie.data.reduce((sum, item) => sum + item.rate, 0) /
            serie.data.length
          : 0;

      const prevSerie = data.previous?.find((p) => p.id === serie.id);
      const prevAvgRate =
        prevSerie && prevSerie.data.length > 0
          ? prevSerie.data.reduce((sum, item) => sum + item.rate, 0) /
            prevSerie.data.length
          : undefined;

      return {
        id: serie.id,
        serieId: serie.id,
        serieName:
          serie.breakdowns.length > 0 ? serie.breakdowns : ['Conversion'],
        breakdownValues: serie.breakdowns,
        avgRate,
        prevAvgRate,
        total,
        conversions,
        dateValues,
      };
    });
  }, [allSeries, dates, data.previous]);

  // Calculate ranges for color visualization (memoized)
  const { metricRanges, dateRanges } = useMemo(() => {
    const metricRanges: Record<string, { min: number; max: number }> = {
      avgRate: {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
      total: {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
      conversions: {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      },
    };

    const dateRanges: Record<string, { min: number; max: number }> = {};
    dates.forEach((date) => {
      dateRanges[date] = {
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
      };
    });

    rows.forEach((row) => {
      // Metric ranges
      metricRanges.avgRate.min = Math.min(
        metricRanges.avgRate.min,
        row.avgRate,
      );
      metricRanges.avgRate.max = Math.max(
        metricRanges.avgRate.max,
        row.avgRate,
      );
      metricRanges.total.min = Math.min(metricRanges.total.min, row.total);
      metricRanges.total.max = Math.max(metricRanges.total.max, row.total);
      metricRanges.conversions.min = Math.min(
        metricRanges.conversions.min,
        row.conversions,
      );
      metricRanges.conversions.max = Math.max(
        metricRanges.conversions.max,
        row.conversions,
      );

      // Date ranges
      dates.forEach((date) => {
        const value = row.dateValues[date] ?? 0;
        dateRanges[date]!.min = Math.min(dateRanges[date]!.min, value);
        dateRanges[date]!.max = Math.max(dateRanges[date]!.max, value);
      });
    });

    return { metricRanges, dateRanges };
  }, [rows, dates]);

  // Helper to get background color style
  const getCellBackgroundStyle = (
    value: number,
    min: number,
    max: number,
    colorClass: 'purple' | 'emerald' = 'emerald',
  ): React.CSSProperties => {
    if (value === 0 || max === min) {
      return {};
    }

    const percentage = (value - min) / (max - min);
    const opacity = Math.max(0.05, Math.min(1, percentage));

    const backgroundColor =
      colorClass === 'purple'
        ? `rgba(168, 85, 247, ${opacity})`
        : `rgba(16, 185, 129, ${opacity})`;

    return { backgroundColor };
  };

  const visibleSeriesIds = useMemo(
    () => visibleSeries.map((s) => s.id),
    [visibleSeries],
  );

  const getSerieIndex = (serieId: string): number => {
    return allSeries.findIndex((s) => s.id === serieId);
  };

  const toggleSerieVisibility = (serieId: string) => {
    setVisibleSeries((prev) => {
      if (prev.includes(serieId)) {
        return prev.filter((id) => id !== serieId);
      }
      return [...prev, serieId];
    });
  };

  // Filter and sort rows
  const filteredAndSortedRows = useMemo(() => {
    let result = rows;

    // Apply search filter
    if (globalFilter.trim()) {
      const searchLower = globalFilter.toLowerCase();
      result = rows.filter((row) => {
        // Search in serie name
        if (
          row.serieName.some((name) =>
            name?.toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        // Search in breakdown values
        if (
          row.breakdownValues.some((val) =>
            val?.toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        // Search in metric values
        if (
          String(row.avgRate).toLowerCase().includes(searchLower) ||
          String(row.total).toLowerCase().includes(searchLower) ||
          String(row.conversions).toLowerCase().includes(searchLower)
        ) {
          return true;
        }

        // Search in date values
        if (
          Object.values(row.dateValues).some((val) =>
            String(val).toLowerCase().includes(searchLower),
          )
        ) {
          return true;
        }

        return false;
      });
    }

    // Apply sorting
    if (sorting.length > 0) {
      result = [...result].sort((a, b) => {
        for (const sort of sorting) {
          const { id, desc } = sort;
          let aValue: any;
          let bValue: any;

          if (id === 'serie-name') {
            aValue = a.serieName.join(' > ') ?? '';
            bValue = b.serieName.join(' > ') ?? '';
          } else if (id === 'metric-avgRate') {
            aValue = a.avgRate ?? 0;
            bValue = b.avgRate ?? 0;
          } else if (id === 'metric-total') {
            aValue = a.total ?? 0;
            bValue = b.total ?? 0;
          } else if (id === 'metric-conversions') {
            aValue = a.conversions ?? 0;
            bValue = b.conversions ?? 0;
          } else if (id.startsWith('date-')) {
            const date = id.replace('date-', '');
            aValue = a.dateValues[date] ?? 0;
            bValue = b.dateValues[date] ?? 0;
          } else {
            continue;
          }

          // Handle null/undefined values
          if (aValue == null && bValue == null) continue;
          if (aValue == null) return 1;
          if (bValue == null) return -1;

          // Compare values
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            const comparison = aValue.localeCompare(bValue);
            if (comparison !== 0) return desc ? -comparison : comparison;
          } else {
            if (aValue < bValue) return desc ? 1 : -1;
            if (aValue > bValue) return desc ? -1 : 1;
          }
        }
        return 0;
      });
    }

    return result;
  }, [rows, globalFilter, sorting]);

  const handleSort = (columnId: string) => {
    setSorting((prev) => {
      const existingSort = prev.find((s) => s.id === columnId);
      if (existingSort) {
        if (existingSort.desc) {
          // Toggle to ascending if already descending
          return [{ id: columnId, desc: false }];
        }
        // Remove sort if already ascending
        return [];
      }
      // Start with descending (highest first)
      return [{ id: columnId, desc: true }];
    });
  };

  const getSortIcon = (columnId: string) => {
    const sort = sorting.find((s) => s.id === columnId);
    if (!sort) return '⇅';
    return sort.desc ? '↓' : '↑';
  };

  if (allSeries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-card mt-8">
      <ReportTableToolbar
        search={globalFilter}
        onSearchChange={setGlobalFilter}
        onUnselectAll={() => setVisibleSeries([])}
      />
      <div
        className="overflow-x-auto overflow-y-auto"
        style={{
          width: '100%',
          maxHeight: '600px',
        }}
      >
        <table className="w-full" style={{ minWidth: 'fit-content' }}>
          <thead className="bg-muted/30 border-b sticky top-0 z-10">
            <tr>
              <th
                className="text-left h-10 px-4 text-[10px] uppercase font-semibold sticky left-0 bg-card z-20 min-w-[200px] border-r border-border whitespace-nowrap"
                style={{
                  boxShadow: '2px 0 4px -2px var(--border)',
                }}
              >
                <div className="flex items-center">Serie</div>
              </th>
              <th
                className="text-right h-10 px-4 text-[10px] uppercase font-semibold min-w-[100px] cursor-pointer hover:bg-muted/50 select-none border-r border-border whitespace-nowrap"
                onClick={() => handleSort('metric-avgRate')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('metric-avgRate');
                  }
                }}
              >
                <div className="flex items-center justify-end gap-1.5">
                  Avg Rate
                  <span className="text-muted-foreground">
                    {getSortIcon('metric-avgRate')}
                  </span>
                </div>
              </th>
              <th
                className="text-right h-10 px-4 text-[10px] uppercase font-semibold min-w-[100px] cursor-pointer hover:bg-muted/50 select-none border-r border-border whitespace-nowrap"
                onClick={() => handleSort('metric-total')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('metric-total');
                  }
                }}
              >
                <div className="flex items-center justify-end gap-1.5">
                  Total
                  <span className="text-muted-foreground">
                    {getSortIcon('metric-total')}
                  </span>
                </div>
              </th>
              <th
                className="text-right h-10 px-4 text-[10px] uppercase font-semibold min-w-[100px] cursor-pointer hover:bg-muted/50 select-none border-r border-border whitespace-nowrap"
                onClick={() => handleSort('metric-conversions')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSort('metric-conversions');
                  }
                }}
              >
                <div className="flex items-center justify-end gap-1.5">
                  Conversions
                  <span className="text-muted-foreground">
                    {getSortIcon('metric-conversions')}
                  </span>
                </div>
              </th>
              {dates.map((date) => (
                <th
                  key={date}
                  className="text-right h-10 px-4 text-[10px] uppercase font-semibold min-w-[100px] cursor-pointer hover:bg-muted/50 select-none border-r border-border whitespace-nowrap"
                  onClick={() => handleSort(`date-${date}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSort(`date-${date}`);
                    }
                  }}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {formatDate(date)}
                    <span className="text-muted-foreground">
                      {getSortIcon(`date-${date}`)}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row) => {
              const isVisible = visibleSeriesIds.includes(row.serieId);
              const serieIndex = getSerieIndex(row.serieId);
              const color = getChartColor(serieIndex);
              const previousMetric =
                row.prevAvgRate !== undefined
                  ? getPreviousMetric(row.avgRate, row.prevAvgRate)
                  : null;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b hover:bg-muted/30 transition-colors',
                    !isVisible && 'opacity-50',
                  )}
                >
                  <td
                    className="px-4 py-3 sticky left-0 z-10 border-r border-border"
                    style={{
                      backgroundColor: 'var(--card)',
                      boxShadow: '2px 0 4px -2px var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isVisible}
                        onCheckedChange={() =>
                          toggleSerieVisibility(row.serieId)
                        }
                        style={{
                          borderColor: color,
                          backgroundColor: isVisible ? color : 'transparent',
                        }}
                        className="h-4 w-4 shrink-0"
                      />
                      <div
                        className="w-[3px] rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <SerieIcon name={row.serieName} />
                      <SerieName name={row.serieName} className="truncate" />
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono text-sm"
                    style={getCellBackgroundStyle(
                      row.avgRate,
                      metricRanges.avgRate.min,
                      metricRanges.avgRate.max,
                      'purple',
                    )}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <span>
                        {number.formatWithUnit(row.avgRate / 100, '%')}
                      </span>
                      {previousMetric && (
                        <PreviousDiffIndicatorPure {...previousMetric} />
                      )}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono text-sm"
                    style={getCellBackgroundStyle(
                      row.total,
                      metricRanges.total.min,
                      metricRanges.total.max,
                      'purple',
                    )}
                  >
                    {number.format(row.total)}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono text-sm"
                    style={getCellBackgroundStyle(
                      row.conversions,
                      metricRanges.conversions.min,
                      metricRanges.conversions.max,
                      'purple',
                    )}
                  >
                    {number.format(row.conversions)}
                  </td>
                  {dates.map((date) => {
                    const value = row.dateValues[date] ?? 0;
                    return (
                      <td
                        key={date}
                        className="px-4 py-3 text-right font-mono text-sm"
                        style={getCellBackgroundStyle(
                          value,
                          dateRanges[date]!.min,
                          dateRanges[date]!.max,
                          'emerald',
                        )}
                      >
                        {number.formatWithUnit(value / 100, '%')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
