'use client';

import { useMemo } from 'react';
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

import { round } from '@openpanel/common';
import { NOT_SET_VALUE } from '@openpanel/constants';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';
import { SerieIcon } from './SerieIcon';
import { SerieName } from './SerieName';

interface ReportBarChartProps {
  data: IChartData;
}

export function ReportBarChart({ data }: ReportBarChartProps) {
  const { editMode, metric, onClick, limit, dropdownMenuContent } =
    useChartContext();
  const number = useNumber();
  const series = useMemo(
    () => (editMode ? data.series : data.series.slice(0, limit || 10)),
    [data, editMode, limit]
  );
  const maxCount = Math.max(...series.map((serie) => serie.metrics[metric]));

  return (
    <div
      className={cn(
        'flex flex-col text-sm',
        editMode ? 'card gap-2 p-4 text-base' : '-m-3 gap-1'
      )}
    >
      {series.map((serie) => {
        const isClickable = !serie.names.includes(NOT_SET_VALUE) && onClick;
        const isDropDownEnabled =
          !serie.names.includes(NOT_SET_VALUE) &&
          (dropdownMenuContent?.(serie) || []).length > 0;

        return (
          <DropdownMenu key={serie.id}>
            <DropdownMenuTrigger asChild disabled={!isDropDownEnabled}>
              <div
                className={cn(
                  'relative',
                  (isClickable || isDropDownEnabled) && 'cursor-pointer'
                )}
                {...(isClickable && !isDropDownEnabled
                  ? { onClick: () => onClick?.(serie) }
                  : {})}
              >
                <div
                  className="absolute bottom-0 left-0 top-0 rounded bg-def-200"
                  style={{
                    width: `${(serie.metrics.sum / maxCount) * 100}%`,
                  }}
                />
                <div className="relative z-10 flex w-full flex-1 items-center gap-4 overflow-hidden px-3 py-2">
                  <div className="flex flex-1 items-center gap-2 break-all font-medium">
                    <SerieIcon name={serie.names[0]} />
                    <SerieName name={serie.names} />
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-end gap-4">
                    <PreviousDiffIndicator
                      {...serie.metrics.previous?.[metric]}
                    />
                    {serie.metrics.previous?.[metric]?.value}
                    <div className="text-muted-foreground">
                      {number.format(
                        round((serie.metrics.sum / data.metrics.sum) * 100, 2)
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

  // return (
  //   <Table
  //     overflow={editMode}
  //     className={cn('table-fixed', editMode ? '' : 'mini')}
  //   >
  //     <TableHeader>
  //       {table.getHeaderGroups().map((headerGroup) => (
  //         <TableRow key={headerGroup.id}>
  //           {headerGroup.headers.map((header) => (
  //             <TableHead
  //               key={header.id}
  //               {...{
  //                 colSpan: header.colSpan,
  //               }}
  //             >
  //               <div
  //                 {...{
  //                   className: cn(
  //                     'flex items-center gap-2',
  //                     header.column.getCanSort() && 'cursor-pointer select-none'
  //                   ),
  //                   onClick: header.column.getToggleSortingHandler(),
  //                 }}
  //               >
  //                 {flexRender(
  //                   header.column.columnDef.header,
  //                   header.getContext()
  //                 )}
  //                 {{
  //                   asc: <ChevronUp className="ml-auto" size={14} />,
  //                   desc: <ChevronDown className="ml-auto" size={14} />,
  //                 }[header.column.getIsSorted() as string] ?? null}
  //               </div>
  //             </TableHead>
  //           ))}
  //         </TableRow>
  //       ))}
  //     </TableHeader>
  //     <TableBody>
  //       {table.getRowModel().rows.map((row) => (
  //         <TableRow
  //           key={row.id}
  //           {...(onClick
  //             ? {
  //                 onClick() {
  //                   onClick(row.original);
  //                 },
  //                 className: 'cursor-pointer',
  //               }
  //             : {})}
  //         >
  //           {row.getVisibleCells().map((cell) => (
  //             <TableCell key={cell.id}>
  //               {flexRender(cell.column.columnDef.cell, cell.getContext())}
  //             </TableCell>
  //           ))}
  //         </TableRow>
  //       ))}
  //     </TableBody>
  //   </Table>
  // );
}
