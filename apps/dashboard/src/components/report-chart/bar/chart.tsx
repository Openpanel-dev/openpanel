'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { DropdownMenuPortal } from '@radix-ui/react-dropdown-menu';
import { useMemo, useState } from 'react';

import { round } from '@openpanel/common';
import { NOT_SET_VALUE } from '@openpanel/constants';

import { PreviousDiffIndicator } from '../common/previous-diff-indicator';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const [isOpen, setOpen] = useState<string | null>(null);
  const {
    isEditMode,
    report: { metric, limit },
    options: { onClick, dropdownMenuContent, columns },
  } = useReportChartContext();
  const number = useNumber();
  const series = useMemo(
    () => (isEditMode ? data.series : data.series.slice(0, limit || 10)),
    [data, isEditMode, limit],
  );
  const maxCount = Math.max(...series.map((serie) => serie.metrics[metric]));

  return (
    <div
      className={cn(
        'flex flex-col text-sm',
        isEditMode ? 'card gap-2 p-4 text-base' : '-m-3 gap-1',
      )}
    >
      {columns && columns.length > 0 && (
        <div className="relative z-10 flex w-full flex-1 items-center gap-4 overflow-hidden px-3 pt-2 pb-1">
          {columns.map((column, index) => {
            const isLast = columns.length - 1 <= index;
            return (
              <div
                key={column?.toString()}
                className={cn(
                  'flex flex-1 items-center gap-2 break-all font-medium',
                  isLast && 'justify-end text-right',
                )}
              >
                {column}
              </div>
            );
          })}
        </div>
      )}
      {series.map((serie) => {
        const isClickable = !serie.names.includes(NOT_SET_VALUE) && onClick;
        const isDropDownEnabled =
          !serie.names.includes(NOT_SET_VALUE) &&
          (dropdownMenuContent?.(serie) || []).length > 0;

        return (
          <DropdownMenu
            key={serie.id}
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
                    // We need to disable onPointerDown event to prevent the
                    // dropdown from opening when the user is scrolling (mobile/tablet).
                    // We also need to handle open/closed state and chnage this
                    // when onClick happens
                    onPointerDown: (e) => e.preventDefault(),
                    onClick: () => setOpen(serie.id),
                  }
                : {})}
            >
              <div
                className={cn(
                  'relative',
                  (isClickable || isDropDownEnabled) && 'cursor-pointer',
                )}
                {...(isClickable && !isDropDownEnabled
                  ? {
                      onClick: () => onClick(serie),
                    }
                  : {})}
              >
                <div
                  className="absolute bottom-0.5 left-1 right-1 top-0.5 rounded bg-def-200"
                  style={{
                    width: `calc(${(serie.metrics.sum / maxCount) * 100}% - 8px)`,
                  }}
                />
                <div className="relative z-10 flex w-full flex-1 items-center gap-4 overflow-hidden px-3 py-2">
                  <div className="flex flex-1 items-center gap-2 break-all font-medium">
                    <SerieIcon name={serie.names[0]} />
                    <SerieName name={serie.names} />
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-end gap-4 font-mono">
                    <PreviousDiffIndicator
                      {...serie.metrics.previous?.[metric]}
                    />
                    {serie.metrics.previous?.[metric]?.value}
                    <div className="text-muted-foreground">
                      {number.format(
                        round((serie.metrics.sum / data.metrics.sum) * 100, 2),
                      )}
                      %
                    </div>
                    <div className="font-bold">
                      {number.format(serie.metrics.sum)}
                    </div>
                  </div>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent>
                {dropdownMenuContent?.(serie).map((item) => (
                  <DropdownMenuItem key={item.title} onClick={item.onClick}>
                    {item.icon && <item.icon size={16} className="mr-2" />}
                    {item.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
