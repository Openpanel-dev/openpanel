import type { Table as ITable } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';
import { getCommonPinningStyles } from './data-table-helpers';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { FloatingPagination } from '@/components/pagination-floating';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/utils/cn';

export interface DataTableProps<TData> {
  table: ITable<TData>;
  className?: string;
  loading?: boolean;
  /**
   * A failed query, not an empty one. Without this the table renders its
   * empty state for both, so a 500 from `profile.list` reads as "you haven't
   * identified any profiles yet" (ISSUES.md H11).
   */
  error?: boolean;
  empty?: {
    title: string;
    description: string;
  };
  onRowClick?: (row: import('@tanstack/react-table').Row<TData>) => void;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    pinned?: 'left' | 'right';
    bold?: boolean;
  }
}

export function DataTable<TData>({
  table,
  loading,
  error,
  className,
  onRowClick,
  empty = {
    title: 'No data',
    description: 'We could not find any data here yet',
  },
  ...props
}: DataTableProps<TData>) {
  return (
    <div
      className={cn('flex w-full flex-col gap-2.5 overflow-auto', className)}
      {...props}
    >
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    colSpan={header.colSpan}
                    key={header.id}
                    style={{
                      ...getCommonPinningStyles({
                        column: header.column,
                      }),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={table.getAllColumns().length}
                >
                  <FullPageErrorState
                    description="We could not load this data. Try again in a moment."
                    title="Something went wrong"
                  />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  className={onRowClick ? 'cursor-pointer' : undefined}
                  data-state={row.getIsSelected() && 'selected'}
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className={cn(
                        cell.column.columnDef.meta?.bold && 'font-medium'
                      )}
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({
                          column: cell.column,
                        }),
                      }}
                    >
                      {loading ? (
                        <Skeleton className="h-4 w-3/5" />
                      ) : (
                        flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={table.getAllColumns().length}
                >
                  <FullPageEmptyState
                    description={empty.description}
                    title={empty.title}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <>
          <FloatingPagination
            canNextPage={table.getCanNextPage()}
            canPreviousPage={table.getCanPreviousPage()}
            firstPage={table.firstPage}
            lastPage={table.lastPage}
            nextPage={table.nextPage}
            pageIndex={table.getState().pagination.pageIndex}
            previousPage={table.previousPage}
          />
          <div className="h-20" />
        </>
      )}
    </div>
  );
}
