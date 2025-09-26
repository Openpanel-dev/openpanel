'use client';

import { GridCell } from '@/components/grid-table';
import { cn } from '@/utils/cn';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import throttle from 'lodash.throttle';
import { useEffect, useRef, useState } from 'react';
import { useEventsTableColumns } from './events-table-columns';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
}

export function EventsDataTable<TData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const [visibleColumns] = useEventsTableColumns();
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const { rows } = table.getRowModel();

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 48,
    scrollMargin,
    overscan: 10,
  });

  useEffect(() => {
    const updateScrollMargin = throttle(() => {
      if (parentRef.current) {
        setScrollMargin(
          parentRef.current.getBoundingClientRect().top + window.scrollY,
        );
      }
    }, 500);

    // Initial calculation
    updateScrollMargin();

    // Listen for scroll and resize events
    window.addEventListener('scroll', updateScrollMargin);
    window.addEventListener('resize', updateScrollMargin);

    return () => {
      window.removeEventListener('scroll', updateScrollMargin);
      window.removeEventListener('resize', updateScrollMargin);
    };
  }, []); // Empty dependency array since we're setting up listeners

  const visibleRows = virtualizer.getVirtualItems();

  return (
    <div className="card">
      <div className="relative w-full overflow-auto rounded-md">
        <div
          className="w-full"
          style={{
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <div className="thead row h-12 sticky top-0" key={headerGroup.id}>
              {headerGroup.headers
                .filter((header) => visibleColumns.includes(header.id))
                .map((header) => {
                  return (
                    <GridCell
                      key={header.id}
                      isHeader
                      style={{
                        minWidth: header.column.getSize(),
                        flexShrink: 1,
                        overflow: 'hidden',
                        flex: 1,
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </GridCell>
                  );
                })}
            </div>
          ))}
          <div ref={parentRef} className="w-full">
            <div
              className="tbody [&>*:last-child]:border-0"
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {visibleRows.map((virtualRow, index) => {
                const row = rows[virtualRow.index]!;
                if (!row) {
                  return null;
                }

                return (
                  <div
                    key={row.id}
                    className={cn('absolute top-0 left-0 w-full h-12 row')}
                    style={{
                      transform: `translateY(${
                        virtualRow.start - virtualizer.options.scrollMargin
                      }px)`,
                    }}
                  >
                    {row
                      .getVisibleCells()
                      .filter((cell) => visibleColumns.includes(cell.column.id))
                      .map((cell) => {
                        return (
                          <GridCell
                            key={cell.id}
                            className={cell.column.columnDef.meta?.className}
                            style={{
                              minWidth: cell.column.getSize(),
                              flexShrink: 1,
                              overflow: 'hidden',
                              flex: 1,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </GridCell>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
