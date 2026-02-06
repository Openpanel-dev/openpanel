import { Checkbox } from '@/components/ui/checkbox';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Tables } from './chart';

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

  // Get the color index for a breakdown based on its position in the
  // visible series list (so colors match the chart bars)
  const getVisibleIndex = (id: string) => {
    return visibleSeriesIds.indexOf(id);
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
            key={item.id}
            data={{
              current: item,
              previous: previousData[index] ?? null,
            }}
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
        const visibleIndex = getVisibleIndex(item.id);
        const previousItem = previousData[index] ?? null;
        const hasBreakdownName =
          item.breakdowns && item.breakdowns.length > 0;
        const color =
          isVisible && visibleIndex !== -1
            ? getChartColor(visibleIndex)
            : undefined;

        return (
          <div key={item.id} className="col">
            {/* Compact row */}
            <div
              className={cn(
                'card row items-center gap-3 px-4 py-3 text-left w-full',
                isExpanded && 'rounded-b-none',
              )}
            >
              {/* Chart visibility checkbox */}
              {hasBreakdowns && (
                <Checkbox
                  checked={isVisible}
                  onCheckedChange={() => toggleVisibility(item.id)}
                  className="shrink-0"
                  style={{
                    borderColor: color,
                    backgroundColor: isVisible ? color : 'transparent',
                  }}
                />
              )}

              {/* Expandable row content */}
              <button
                type="button"
                onClick={() => toggleExpanded(item.id)}
                className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium truncate">
                  {hasBreakdownName
                    ? item.breakdowns.join(' > ')
                    : 'Funnel'}
                </span>
              </button>

              <div className="flex items-center gap-6 shrink-0">
                <div className="text-right row gap-2 items-center">
                  <div className="text-muted-foreground text-sm">
                    Conversion
                  </div>
                  <div className="font-mono font-semibold text-sm">
                    {number.formatWithUnit(
                      item.lastStep.percent / 100,
                      '%',
                    )}
                  </div>
                </div>
                <div className="text-right row gap-2 items-center">
                  <div className="text-muted-foreground text-sm">
                    Completed
                  </div>
                  <div className="font-mono font-semibold text-sm">
                    {number.format(item.lastStep.count)}
                  </div>
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
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
