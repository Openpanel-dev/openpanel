'use client';

import { cn } from '@/utils/cn';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';

import { Grid, GridBody, GridCell, GridHeader, GridRow } from './grid-table';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
}

export function TableButtons({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-2 flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}

export function DataTable<TData>({ columns, data }: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Grid columns={columns.length}>
      <GridHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <GridRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <GridCell key={header.id} isHeader>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </GridCell>
            ))}
          </GridRow>
        ))}
      </GridHeader>
      <GridBody>
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <GridRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
            >
              {row.getVisibleCells().map((cell) => (
                <GridCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </GridCell>
              ))}
            </GridRow>
          ))
        ) : (
          <GridRow>
            <GridCell colSpan={columns.length}>
              <div className="h-24 text-center">No results.</div>
            </GridCell>
          </GridRow>
        )}
      </GridBody>
    </Grid>
  );
}
