import type { Table as ITable, Row } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import {
  useWindowVirtualizer,
  type VirtualItem,
} from '@tanstack/react-virtual';
import throttle from 'lodash.throttle';
import { useEffect, useRef, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../table';
import { DataTableColumnHeader } from './data-table-column-header';
import { getCommonPinningStyles } from './data-table-helpers';
import { Skeleton } from '@/components/skeleton';
import { cn } from '@/utils/cn';

export interface DataTableProps<TData> {
  table: ITable<TData>;
  className?: string;
  loading?: boolean;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    pinned?: 'left' | 'right';
    bold?: boolean;
  }
}

export function VirtualizedDataTable<TData>({
  table,
  loading,
  className,
  ...props
}: DataTableProps<TData>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const { rows } = table.getRowModel();

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 60,
    scrollMargin,
    overscan: 10,
  });

  useEffect(() => {
    const updateScrollMargin = throttle(() => {
      if (parentRef.current) {
        setScrollMargin(
          parentRef.current.getBoundingClientRect().top + window.scrollY
        );
      }
    }, 500);

    // Initial calculation
    updateScrollMargin();

    // Listen for scroll and resize events
    // window.addEventListener('scroll', updateScrollMargin);
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      // window.removeEventListener('scroll', updateScrollMargin);
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, []);

  const visibleRows = virtualizer.getVirtualItems();

  const renderTableRow = (row: Row<TData>, virtualRow: VirtualItem) => {
    return (
      <TableRow
        className={cn('absolute top-0 left-0 w-full')}
        // ref={virtualizer.measureElement}
        data-index={virtualRow.index}
        key={row.id}
        style={{
          transform: `translateY(${
            virtualRow.start - virtualizer.options.scrollMargin
          }px)`,
          height: `${virtualRow.size}px`,
          display: 'flex',
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            className={cn(cell.column.columnDef.meta?.bold && 'font-medium')}
            key={cell.id}
            style={{
              ...getCommonPinningStyles({ column: cell.column }),
              width: cell.column.getSize(),
              minWidth: cell.column.getSize(),
              maxWidth: cell.column.getSize(),
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {loading ? (
              <Skeleton className="h-4 w-3/5" />
            ) : (
              flexRender(cell.column.columnDef.cell, cell.getContext())
            )}
          </TableCell>
        ))}
      </TableRow>
    );
  };

  return (
    <div
      className={cn('flex w-full flex-col gap-2.5 overflow-auto', className)}
      {...props}
    >
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} style={{ display: 'flex' }}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    colSpan={header.colSpan}
                    key={header.id}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                      width: header.column.getSize(),
                      minWidth: header.column.getSize(),
                      maxWidth: header.column.getSize(),
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {header.isPlaceholder ? null : typeof header.column
                        .columnDef.header === 'function' ? (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    ) : (
                      <DataTableColumnHeader
                        column={header.column}
                        title={header.column.columnDef.header ?? ''}
                      />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {visibleRows.length ? (
              visibleRows.map((row) => renderTableRow(rows[row.index]!, row))
            ) : (
              <TableRow style={{ display: 'flex', height: '96px' }}>
                <TableCell
                  className="flex h-24 items-center justify-center text-center"
                  colSpan={table.getAllColumns().length}
                  style={{ width: '100%' }}
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
