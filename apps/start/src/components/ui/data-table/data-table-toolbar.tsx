'use client';

import type { Column, Table } from '@tanstack/react-table';
import { SearchIcon, X, XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { DataTableDateFilter } from '@/components/ui/data-table/data-table-date-filter';
import { DataTableFacetedFilter } from '@/components/ui/data-table/data-table-faceted-filter';
import { DataTableSliderFilter } from '@/components/ui/data-table/data-table-slider-filter';
import { DataTableViewOptions } from '@/components/ui/data-table/data-table-view-options';
import { Input } from '@/components/ui/input';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { cn } from '@/lib/utils';

interface DataTableToolbarProps<TData> extends React.ComponentProps<'div'> {
  table: Table<TData>;
  globalSearchKey?: string;
  globalSearchPlaceholder?: string;
}

export function DataTableToolbarContainer({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        'flex flex-1 items-start justify-between gap-2 mb-2',
        className,
      )}
      {...props}
    />
  );
}

export function DataTableToolbar<TData>({
  table,
  children,
  className,
  globalSearchKey,
  globalSearchPlaceholder,
  ...props
}: DataTableToolbarProps<TData>) {
  const { search, setSearch } = useSearchQueryState({
    searchKey: globalSearchKey,
  });
  const isFiltered = table.getState().columnFilters.length > 0;

  const columns = React.useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table],
  );

  const onReset = React.useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <DataTableToolbarContainer className={className} {...props}>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {globalSearchKey && (
          <AnimatedSearchInput
            placeholder={globalSearchPlaceholder ?? 'Search'}
            value={search}
            onChange={setSearch}
          />
        )}
        {columns.map((column) => (
          <DataTableToolbarFilter key={column.id} column={column} />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            variant="outline"
            size="sm"
            className="border-dashed"
            onClick={onReset}
          >
            <XIcon className="size-4 mr-2" />
            Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <DataTableViewOptions table={table} />
      </div>
    </DataTableToolbarContainer>
  );
}
interface DataTableToolbarFilterProps<TData> {
  column: Column<TData>;
}

function DataTableToolbarFilter<TData>({
  column,
}: DataTableToolbarFilterProps<TData>) {
  {
    const columnMeta = column.columnDef.meta;

    const getTitle = React.useCallback(() => {
      return columnMeta?.label ?? columnMeta?.placeholder ?? column.id;
    }, [columnMeta, column]);

    const onFilterRender = React.useCallback(() => {
      if (!columnMeta?.variant) return null;

      switch (columnMeta.variant) {
        case 'text':
          return (
            <AnimatedSearchInput
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ''}
              onChange={(value) => column.setFilterValue(value)}
            />
          );

        case 'number':
          return (
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                placeholder={getTitle()}
                value={(column.getFilterValue() as string) ?? ''}
                onChange={(event) => column.setFilterValue(event.target.value)}
                className={cn('h-8 w-[120px]', columnMeta.unit && 'pr-8')}
              />
              {columnMeta.unit && (
                <span className="absolute top-0 right-0 bottom-0 flex items-center rounded-r-md bg-accent px-2 text-muted-foreground text-sm">
                  {columnMeta.unit}
                </span>
              )}
            </div>
          );

        case 'range':
          return <DataTableSliderFilter column={column} title={getTitle()} />;

        case 'date':
        case 'dateRange':
          return (
            <DataTableDateFilter
              column={column}
              title={getTitle()}
              multiple={columnMeta.variant === 'dateRange'}
            />
          );

        case 'select':
        case 'multiSelect':
          return (
            <DataTableFacetedFilter
              column={column}
              title={getTitle()}
              options={columnMeta.options ?? []}
              multiple={columnMeta.variant === 'multiSelect'}
            />
          );

        default:
          return null;
      }
    }, [column, columnMeta]);

    return onFilterRender();
  }
}

interface AnimatedSearchInputProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export function AnimatedSearchInput({
  placeholder,
  value,
  onChange,
}: AnimatedSearchInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isExpanded = isFocused || (value?.length ?? 0) > 0;

  const handleClear = React.useCallback(() => {
    onChange('');
    // Re-focus after clearing
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  return (
    <div
      className={cn(
        'relative flex h-8 items-center rounded-md border border-input bg-background text-sm transition-[width] duration-300 ease-out',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        isExpanded ? 'w-56 lg:w-72' : 'w-32',
      )}
      role="search"
      aria-label={placeholder ?? 'Search'}
    >
      <SearchIcon className="size-4 ml-2 shrink-0" />

      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'absolute inset-0 -top-px h-8 w-full rounded-md border-0 bg-transparent pl-7 pr-7 shadow-none',
          'focus-visible:ring-0 focus-visible:ring-offset-0',
          'transition-opacity duration-200',
          'font-medium text-[14px] truncate align-baseline',
        )}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />

      {isExpanded && value && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClear();
          }}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
