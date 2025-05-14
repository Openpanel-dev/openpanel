'use client';

import { cn } from '@/utils/cn';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, RowData } from '@tanstack/react-table';

import { Grid, GridBody, GridCell, GridHeader, GridRow } from './grid-table';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

export const ACTIONS = '__actions__';

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
            {headerGroup.headers.map((header) => {
              if (header.column.id === ACTIONS) {
                return (
                  <GridCell
                    key={header.id}
                    isHeader
                    className="sticky right-0 center-center"
                  >
                    Actions
                  </GridCell>
                );
              }

              return (
                <GridCell key={header.id} isHeader>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </GridCell>
              );
            })}
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
              {row.getVisibleCells().map((cell) => {
                if (cell.column.id === ACTIONS) {
                  return (
                    <GridCell
                      key={cell.id}
                      className="sticky right-0 bg-background center-center"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </GridCell>
                  );
                }

                return (
                  <GridCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </GridCell>
                );
              })}
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
