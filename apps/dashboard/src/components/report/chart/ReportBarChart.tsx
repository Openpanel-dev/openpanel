'use client';

import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { useNumber } from '@/hooks/useNumerFormatter';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

import { NOT_SET_VALUE } from '@openpanel/constants';

import { PreviousDiffIndicatorText } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';
import { SerieIcon } from './SerieIcon';

interface ReportBarChartProps {
  data: IChartData;
}

export function ReportBarChart({ data }: ReportBarChartProps) {
  const { editMode, metric, onClick } = useChartContext();
  const number = useNumber();
  const series = useMemo(
    () => (editMode ? data.series : data.series.slice(0, 10)),
    [data, editMode]
  );
  const maxCount = Math.max(...series.map((serie) => serie.metrics[metric]));

  return (
    <div
      className={cn(
        '-mx-2 flex w-full flex-col text-xs',
        editMode && 'card p-4 text-base'
      )}
    >
      {series.map((serie, index) => {
        const isClickable = serie.name !== NOT_SET_VALUE && onClick;
        return (
          <div
            key={serie.name}
            className={cn(
              'relative flex w-full flex-1 items-center gap-4 overflow-hidden rounded px-2 py-3 even:bg-slate-50 dark:even:bg-slate-100',
              '[&_[role=progressbar]]:shadow-sm [&_[role=progressbar]]:even:bg-background',
              isClickable &&
                'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-50'
            )}
            {...(isClickable ? { onClick: () => onClick(serie) } : {})}
          >
            <div className="flex flex-1 items-center gap-2 break-all font-medium">
              <SerieIcon name={serie.name} />
              {serie.name}
            </div>
            <div className="flex w-1/4 flex-shrink-0 items-center justify-end gap-4">
              <PreviousDiffIndicatorText
                {...serie.metrics.previous[metric]}
                className="text-xs font-medium"
              />
              {serie.metrics.previous[metric]?.value}
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
