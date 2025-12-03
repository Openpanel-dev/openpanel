import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { DropdownMenuPortal } from '@radix-ui/react-dropdown-menu';
import { useMemo, useState } from 'react';

import { round } from '@openpanel/common';
import { NOT_SET_VALUE } from '@openpanel/constants';

import { OverviewWidgetTable } from '../../overview/overview-widget-table';
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
    report: { metric, limit, previous },
    options: { onClick, dropdownMenuContent, columns },
  } = useReportChartContext();
  const number = useNumber();
  const series = useMemo(
    () => (isEditMode ? data.series : data.series.slice(0, limit || 10)),
    [data, isEditMode, limit],
  );
  const maxCount = Math.max(
    ...series.map((serie) => serie.metrics[metric] ?? 0),
  );

  const tableColumns = [
    {
      name: columns?.[0] || 'Name',
      width: 'w-full',
      render: (serie: (typeof series)[0]) => {
        const isClickable = !serie.names.includes(NOT_SET_VALUE) && onClick;
        const isDropDownEnabled =
          !serie.names.includes(NOT_SET_VALUE) &&
          (dropdownMenuContent?.(serie) || []).length > 0;

        return (
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
                    onClick: () => setOpen(serie.id),
                  }
                : {})}
            >
              <div
                className={cn(
                  'flex items-center gap-2 break-all font-medium',
                  (isClickable || isDropDownEnabled) && 'cursor-pointer',
                )}
                {...(isClickable && !isDropDownEnabled
                  ? {
                      onClick: () => onClick(serie),
                    }
                  : {})}
              >
                <SerieIcon name={serie.names[0]} />
                <SerieName name={serie.names} />
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
      },
    },
    // Percentage column
    {
      name: '%',
      width: '70px',
      render: (serie: (typeof series)[0]) => (
        <div className="text-muted-foreground font-mono">
          {number.format(
            round((serie.metrics.sum / data.metrics.sum) * 100, 2),
          )}
          %
        </div>
      ),
    },

    // Previous value column
    {
      name: 'Previous',
      width: '130px',
      render: (serie: (typeof series)[0]) => (
        <div className="flex items-center gap-2 font-mono justify-end">
          <div className="font-bold">
            {number.format(serie.metrics.previous?.[metric]?.value)}
          </div>
          <PreviousDiffIndicator
            {...serie.metrics.previous?.[metric]}
            size="xs"
            className="text-muted-foreground"
          />
        </div>
      ),
    },

    // Main count column (always last)
    {
      name: 'Count',
      width: '80px',
      render: (serie: (typeof series)[0]) => (
        <div className="font-bold font-mono">
          {number.format(serie.metrics.sum)}
        </div>
      ),
    },
  ];

  return (
    <div
      className={cn(
        'text-sm',
        isEditMode ? 'card gap-2 p-4 text-base' : '-m-3',
      )}
    >
      <OverviewWidgetTable
        data={series}
        keyExtractor={(serie) => serie.id}
        columns={tableColumns.filter((column) => {
          if (!previous && column.name === 'Previous') {
            return false;
          }
          return true;
        })}
        getColumnPercentage={(serie) => serie.metrics.sum / maxCount}
        className={cn(isEditMode ? 'min-h-[358px]' : 'min-h-0')}
      />
    </div>
  );
}
