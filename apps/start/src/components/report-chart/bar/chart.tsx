import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { DropdownMenuPortal } from '@radix-ui/react-dropdown-menu';
import { SearchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { round } from '@openpanel/common';
import { NOT_SET_VALUE } from '@openpanel/constants';

import { DeltaChip } from '@/components/delta-chip';
import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

type SortOption =
  | 'count-desc'
  | 'count-asc'
  | 'name-asc'
  | 'name-desc'
  | 'percent-desc'
  | 'percent-asc';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const [isOpen, setOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('count-desc');
  const {
    isEditMode,
    report: { metric, limit, previous },
    options: { onClick, dropdownMenuContent },
  } = useReportChartContext();
  const number = useNumber();

  // Use useVisibleSeries to add index property for colors
  const { series: allSeriesWithIndex } = useVisibleSeries(data, 500);

  const totalSum = data.metrics.sum || 1;

  // Calculate original ranks (based on count descending - default sort)
  const seriesWithOriginalRank = useMemo(() => {
    const sortedByCount = [...allSeriesWithIndex].sort(
      (a, b) => b.metrics.sum - a.metrics.sum,
    );
    const rankMap = new Map<string, number>();
    sortedByCount.forEach((serie, idx) => {
      rankMap.set(serie.id, idx + 1);
    });
    return allSeriesWithIndex.map((serie) => ({
      ...serie,
      originalRank: rankMap.get(serie.id) ?? 0,
    }));
  }, [allSeriesWithIndex]);

  // Filter and sort series
  const series = useMemo(() => {
    let filtered = seriesWithOriginalRank;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((serie) =>
        serie.names.some((name) => name.toLowerCase().includes(query)),
      );
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'count-desc':
          return b.metrics.sum - a.metrics.sum;
        case 'count-asc':
          return a.metrics.sum - b.metrics.sum;
        case 'name-asc':
          return a.names.join(' > ').localeCompare(b.names.join(' > '));
        case 'name-desc':
          return b.names.join(' > ').localeCompare(a.names.join(' > '));
        case 'percent-desc':
          return b.metrics.sum / totalSum - a.metrics.sum / totalSum;
        case 'percent-asc':
          return a.metrics.sum / totalSum - b.metrics.sum / totalSum;
        default:
          return 0;
      }
    });

    // Apply limit if not in edit mode
    return isEditMode ? sorted : sorted.slice(0, limit || 10);
  }, [
    seriesWithOriginalRank,
    searchQuery,
    sortBy,
    totalSum,
    isEditMode,
    limit,
  ]);

  return (
    <div className={cn('w-full', isEditMode && 'card')}>
      {isEditMode && (
        <div className="flex items-center gap-3 p-4 border-b border-def-200 dark:border-def-800">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Filter by name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              size="sm"
            />
          </div>
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as SortOption)}
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count-desc">Count (High → Low)</SelectItem>
              <SelectItem value="count-asc">Count (Low → High)</SelectItem>
              <SelectItem value="name-asc">Name (A → Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z → A)</SelectItem>
              <SelectItem value="percent-desc">
                Percentage (High → Low)
              </SelectItem>
              <SelectItem value="percent-asc">
                Percentage (Low → High)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="overflow-hidden">
        <div className="divide-y divide-def-200 dark:divide-def-800">
          {series.map((serie, idx) => {
            const isClickable =
              !serie.names.includes(NOT_SET_VALUE) && !!onClick;
            const isDropDownEnabled =
              !serie.names.includes(NOT_SET_VALUE) &&
              (dropdownMenuContent?.(serie) || []).length > 0;

            const color = getChartColor(serie.index);
            const percentOfTotal = round(
              (serie.metrics.sum / totalSum) * 100,
              1,
            );

            return (
              <div
                key={serie.id}
                className={cn(
                  'group relative px-4 py-3 transition-colors overflow-hidden',
                  isClickable && 'cursor-pointer',
                )}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={() => {
                  if (isClickable && !isDropDownEnabled) {
                    onClick?.(serie);
                  }
                }}
                onKeyDown={(e) => {
                  if (!isClickable || isDropDownEnabled) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick?.(serie);
                  }
                }}
              >
                {/* Subtle accent glow */}
                <div
                  className="pointer-events-none absolute -left-10 -top-10 h-40 w-96 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-10"
                  style={{
                    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
                  }}
                />

                <div className="relative z-10 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-def-50 dark:border-def-800 dark:bg-def-900"
                        style={{ borderColor: `${color}22` }}
                      >
                        <SerieIcon name={serie.names[0]} />
                      </div>

                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Rank {serie.originalRank}
                          </span>
                        </div>

                        <DropdownMenu
                          onOpenChange={() =>
                            setOpen((p) => (p === serie.id ? null : serie.id))
                          }
                          open={isOpen === serie.id}
                        >
                          <DropdownMenuTrigger
                            asChild
                            disabled={!isDropDownEnabled}
                            {...(isDropDownEnabled
                              ? {
                                  onPointerDown: (e) => e.preventDefault(),
                                  onClick: (e) => {
                                    e.stopPropagation();
                                    setOpen(serie.id);
                                  },
                                }
                              : {})}
                          >
                            <div
                              className={cn(
                                'min-w-0',
                                isDropDownEnabled && 'cursor-pointer',
                              )}
                              {...(isClickable && !isDropDownEnabled
                                ? {
                                    onClick: (e) => {
                                      e.stopPropagation();
                                      onClick?.(serie);
                                    },
                                  }
                                : {})}
                            >
                              <SerieName
                                name={serie.names}
                                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold tracking-tight"
                              />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuContent>
                              {dropdownMenuContent?.(serie).map((item) => (
                                <DropdownMenuItem
                                  key={item.title}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    item.onClick();
                                  }}
                                >
                                  {item.icon && (
                                    <item.icon size={16} className="mr-2" />
                                  )}
                                  {item.title}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenuPortal>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold font-mono tracking-tight">
                          {number.format(serie.metrics.sum)}
                        </div>
                        {previous && serie.metrics.previous?.[metric] && (
                          <DeltaChip
                            variant={
                              serie.metrics.previous[metric].state ===
                              'positive'
                                ? 'inc'
                                : 'dec'
                            }
                            size="sm"
                          >
                            {serie.metrics.previous[metric].diff?.toFixed(1)}%
                          </DeltaChip>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bar */}
                  <div className="flex items-center">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-def-100 dark:bg-def-900">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${percentOfTotal}%`,
                          background: `linear-gradient(90deg, ${color}aa, ${color})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
