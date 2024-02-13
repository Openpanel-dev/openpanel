'use client';

import { useMemo } from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { Progress } from '@/components/ui/progress';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { NOT_SET_VALUE } from '@/utils/constants';
import { getChartColor } from '@/utils/theme';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';
import { SerieIcon } from './SerieIcon';

interface ReportBarChartProps {
  data: IChartData;
}

export function ReportBarChart({ data }: ReportBarChartProps) {
  const { editMode, metric, onClick } = useChartContext();
  const number = useNumber();
  const series = useMemo(
    () => (editMode ? data.series : data.series.slice(0, 20)),
    [data]
  );
  const maxCount = Math.max(...series.map((serie) => serie.metrics[metric]));

  return (
    <div
      className={cn(
        'flex flex-col w-full divide-y text-xs',
        editMode &&
          'text-base bg-white border border-border rounded-md p-4 pt-2'
      )}
    >
      {editMode && (
        <div className="-m-4 -mb-px flex justify-between font-medium p-4 pt-5 border-b border-border font-medium text-muted-foreground">
          <div>Event</div>
          <div>Count</div>
        </div>
      )}
      {series.map((serie, index) => {
        const isClickable = serie.name !== NOT_SET_VALUE && onClick;
        return (
          <div
            key={serie.name}
            className={cn(
              'py-2 flex flex-1 w-full gap-4 items-center',
              isClickable && 'cursor-pointer hover:bg-gray-100'
            )}
            {...(isClickable ? { onClick: () => onClick(serie) } : {})}
          >
            <div className="flex-1 break-all flex items-center gap-2">
              <SerieIcon name={serie.name} />
              {serie.name}
            </div>
            <div className="flex-shrink-0 flex w-1/4 gap-4 items-center justify-end">
              <PreviousDiffIndicator {...serie.metrics.previous[metric]} />
              <div className="font-bold">
                {number.format(serie.metrics.sum)}
              </div>
              <Progress
                color={getChartColor(index)}
                className={cn('w-1/2', editMode ? 'h-5' : 'h-2')}
                value={(serie.metrics.sum / maxCount) * 100}
              />
            </div>
          </div>
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
