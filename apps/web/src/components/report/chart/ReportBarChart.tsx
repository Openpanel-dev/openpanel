import { useMemo, useState } from 'react';
import type { IChartData, RouterOutputs } from '@/app/_trpc/client';
import { ColorSquare } from '@/components/ColorSquare';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { PreviousDiffIndicator } from '../PreviousDiffIndicator';
import { useChartContext } from './ChartProvider';

const columnHelper =
  createColumnHelper<RouterOutputs['chart']['chart']['series'][number]>();

interface ReportBarChartProps {
  data: IChartData;
}

export function ReportBarChart({ data }: ReportBarChartProps) {
  const { editMode, metric, unit, onClick } = useChartContext();
  const [sorting, setSorting] = useState<SortingState>([]);
  const maxCount = Math.max(
    ...data.series.map((serie) => serie.metrics[metric])
  );
  const number = useNumber();
  const table = useReactTable({
    data: useMemo(
      () => (editMode ? data.series : data.series.slice(0, 20)),
      [editMode, data]
    ),
    columns: useMemo(() => {
      return [
        columnHelper.accessor((row) => row.name, {
          id: 'label',
          header: () => 'Label',
          cell(info) {
            return (
              <div className="flex items-center gap-2">
                <ColorSquare>{info.row.original.event.id}</ColorSquare>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <div className="text-ellipsis overflow-hidden">
                      {info.getValue()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{info.getValue()}</TooltipContent>
                </Tooltip>
              </div>
            );
          },
        }),
        columnHelper.accessor((row) => row.metrics[metric], {
          id: 'totalCount',
          cell: (info) => (
            <div className="flex gap-4 w-full">
              <div className="relative flex-1">
                <div
                  className="top-0 absolute shine h-[20px] rounded-full"
                  style={{
                    width: (info.getValue() / maxCount) * 100 + '%',
                    background: getChartColor(info.row.index),
                  }}
                />
              </div>
              <div className="font-bold">
                {number.format(info.getValue())}
                {unit}
              </div>
              <PreviousDiffIndicator
                {...info.row.original.metrics.previous[metric]}
              />
            </div>
          ),
          header: () => 'Count',
          enableSorting: true,
        }),
      ];
    }, [maxCount, number]),
    state: {
      sorting,
    },
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table
      overflow={editMode}
      className={cn('table-fixed', editMode ? '' : 'mini')}
    >
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                {...{
                  colSpan: header.colSpan,
                }}
              >
                <div
                  {...{
                    className: cn(
                      'flex items-center gap-2',
                      header.column.getCanSort() && 'cursor-pointer select-none'
                    ),
                    onClick: header.column.getToggleSortingHandler(),
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {{
                    asc: <ChevronUp className="ml-auto" size={14} />,
                    desc: <ChevronDown className="ml-auto" size={14} />,
                  }[header.column.getIsSorted() as string] ?? null}
                </div>
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            {...(onClick
              ? {
                  onClick() {
                    onClick(row.original);
                  },
                  className: 'cursor-pointer',
                }
              : {})}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
