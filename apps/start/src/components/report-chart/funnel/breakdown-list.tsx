import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { getPreviousMetric } from '../../../utils/previous-metric';
import { PreviousDiffIndicatorPure } from '../common/previous-diff-indicator';
import { Tables } from './chart';
import { Checkbox } from '@/components/ui/checkbox';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

interface BreakdownListProps {
  data: RouterOutputs['chart']['funnel'];
  visibleSeriesIds: string[];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}

const COMPACT_THRESHOLD = 4;

export function BreakdownList({
  data,
  visibleSeriesIds,
  setVisibleSeries,
}: BreakdownListProps) {
  const allBreakdowns = data.current;
  const previousData = data.previous || [];
  const isCompact = allBreakdowns.length > COMPACT_THRESHOLD;
  const hasBreakdowns = allBreakdowns.length > 1;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const number = useNumber();

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleVisibility = (id: string) => {
    setVisibleSeries((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  };

  // Get the stable color index for a breakdown (position in full list, matches chart)
  const getStableColorIndex = (id: string) => {
    return allBreakdowns.findIndex((b) => b.id === id);
  };

  if (allBreakdowns.length === 0) {
    return null;
  }

  // Detailed mode: <= COMPACT_THRESHOLD breakdowns, show full Tables for each
  if (!isCompact) {
    return (
      <div className="col gap-4">
        {allBreakdowns.map((item, index) => (
          <Tables
            data={{
              current: item,
              previous: previousData[index] ?? null,
            }}
            key={item.id}
          />
        ))}
      </div>
    );
  }

  // Compact mode: > COMPACT_THRESHOLD breakdowns, show compact rows with expand
  return (
    <div className="col gap-2">
      {allBreakdowns.map((item, index) => {
        const isExpanded = expandedIds.has(item.id);
        const isVisible = visibleSeriesIds.includes(item.id);
        const stableColorIndex = getStableColorIndex(item.id);
        const previousItem = previousData[index] ?? null;
        const hasBreakdownName = item.breakdowns && item.breakdowns.length > 0;
        const color =
          stableColorIndex >= 0 ? getChartColor(stableColorIndex) : undefined;

        return (
          <div className="col" key={item.id}>
            {/* Compact row */}
            <div
              className={cn(
                'card row w-full items-center gap-3 px-4 py-3 text-left',
                isExpanded && 'rounded-b-none'
              )}
            >
              {/* Chart visibility checkbox */}
              {hasBreakdowns && (
                <Checkbox
                  checked={isVisible}
                  className="shrink-0"
                  onCheckedChange={() => toggleVisibility(item.id)}
                  style={{
                    borderColor: color,
                    backgroundColor: isVisible && color ? color : 'transparent',
                  }}
                />
              )}

              {/* Expandable row content */}
              <button
                className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
                onClick={() => toggleExpanded(item.id)}
                type="button"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">
                  {hasBreakdownName ? item.breakdowns.join(' > ') : 'Funnel'}
                </span>
              </button>

              <div className="flex shrink-0 items-center gap-6">
                <div className="row items-center gap-2 text-right">
                  <div className="text-muted-foreground text-sm">
                    Conversion
                  </div>
                  <div className="font-mono font-semibold text-sm">
                    {number.formatWithUnit(item.lastStep.percent / 100, '%')}
                  </div>
                  {previousItem && (
                    <PreviousDiffIndicatorPure
                      {...getPreviousMetric(
                        item.lastStep.percent,
                        previousItem.lastStep.percent
                      )}
                    />
                  )}
                </div>
                <div className="row items-center gap-2 text-right">
                  <div className="text-muted-foreground text-sm">Completed</div>
                  <div className="font-mono font-semibold text-sm">
                    {number.format(item.lastStep.count)}
                  </div>
                  {previousItem && (
                    <PreviousDiffIndicatorPure
                      {...getPreviousMetric(
                        item.lastStep.count,
                        previousItem.lastStep.count
                      )}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Expanded detailed view */}
            {isExpanded && (
              <Tables
                data={{
                  current: item,
                  previous: previousItem,
                }}
                noTopBorderRadius
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
