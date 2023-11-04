import { useMemo, useState } from 'react';
import { ColorSquare } from '@/components/ColorSquare';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { IChartData } from '@/types';
import type { RouterOutputs } from '@/utils/api';
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
import { useElementSize } from 'usehooks-ts';

import { useChartContext } from './ChartProvider';

const columnHelper =
  createColumnHelper<RouterOutputs['chart']['chart']['series'][number]>();

interface ReportBarChartProps {
  data: IChartData;
}

export function ReportBarChart({ data }: ReportBarChartProps) {
  const { editMode } = useChartContext();
  const [ref, { width }] = useElementSize();
  const [sorting, setSorting] = useState<SortingState>([]);
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
                {info.getValue()}
              </div>
            );
          },
          footer: (info) => info.column.id,
          size: width ? width * 0.3 : undefined,
        }),
        columnHelper.accessor((row) => row.totalCount, {
          id: 'totalCount',
          cell: (info) => (
            <div className="text-right font-medium">{info.getValue()}</div>
          ),
          header: () => 'Count',
          footer: (info) => info.column.id,
          size: width ? width * 0.1 : undefined,
          enableSorting: true,
        }),
        columnHelper.accessor((row) => row.totalCount, {
          id: 'graph',
          cell: (info) => (
            <div
              className="shine h-4 rounded [.mini_&]:h-3"
              style={{
                width:
                  (info.getValue() / info.row.original.meta.highest) * 100 +
                  '%',
                background: getChartColor(info.row.index),
              }}
            />
          ),
          header: () => 'Graph',
          footer: (info) => info.column.id,
          size: width ? width * 0.6 : undefined,
        }),
      ];
    }, [width]),
    columnResizeMode: 'onChange',
    state: {
      sorting,
    },
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    // debugTable: true,
    // debugHeaders: true,
    // debugColumns: true,
  });
  return (
    <div ref={ref}>
      {editMode && (
        <div className="mb-8 flex flex-wrap gap-4">
          {data.events.map((event) => {
            return (
              <div className="border border-border p-4" key={event.id}>
                <div className="flex items-center gap-2 text-lg font-medium">
                  <ColorSquare>{event.id}</ColorSquare> {event.name}
                </div>
                <div className="mt-6 font-mono text-5xl font-light">
                  {new Intl.NumberFormat('en-IN', {
                    maximumSignificantDigits: 20,
                  }).format(event.count)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="overflow-x-auto">
        <Table
          {...{
            className: editMode ? '' : 'mini',
            style: {
              width: table.getTotalSize(),
            },
          }}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    {...{
                      colSpan: header.colSpan,
                      style: {
                        width: header.getSize(),
                      },
                    }}
                  >
                    <div
                      {...{
                        className: cn(
                          'flex items-center gap-2',
                          header.column.getCanSort() &&
                            'cursor-pointer select-none'
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
                    <div
                      {...(editMode
                        ? {
                            onMouseDown: header.getResizeHandler(),
                            onTouchStart: header.getResizeHandler(),
                            className: `resizer ${
                              header.column.getIsResizing() ? 'isResizing' : ''
                            }`,
                            style: {},
                          }
                        : {})}
                    />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    {...{
                      style: {
                        width: cell.column.getSize(),
                      },
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
