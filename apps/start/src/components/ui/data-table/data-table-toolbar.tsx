import type { Column, Table } from '@tanstack/react-table';
import { SearchIcon, X, XIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
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
      aria-orientation="horizontal"
      className={cn(
        'mb-2 flex flex-1 items-start justify-between gap-2',
        className
      )}
      role="toolbar"
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

  const columns = useMemo(
    () => table.getAllColumns().filter((column) => column.getCanFilter()),
    [table]
  );

  const onReset = useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <DataTableToolbarContainer className={className} {...props}>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {globalSearchKey && (
          <AnimatedSearchInput
            onChange={setSearch}
            placeholder={globalSearchPlaceholder ?? 'Search'}
            value={search}
          />
        )}
        {columns.map((column) => (
          <DataTableToolbarFilter column={column} key={column.id} />
        ))}
        {isFiltered && (
          <Button
            aria-label="Reset filters"
            className="border-dashed"
            onClick={onReset}
            size="sm"
            variant="outline"
          >
            <XIcon className="mr-2 size-4" />
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

    const getTitle = useCallback(() => {
      return columnMeta?.label ?? columnMeta?.placeholder ?? column.id;
    }, [columnMeta, column]);

    const onFilterRender = useCallback(() => {
      if (!columnMeta?.variant) {
        return null;
      }

      switch (columnMeta.variant) {
        case 'text':
          return (
            <AnimatedSearchInput
              onChange={(value) => column.setFilterValue(value)}
              placeholder={columnMeta.placeholder ?? columnMeta.label}
              value={(column.getFilterValue() as string) ?? ''}
            />
          );

        case 'number':
          return (
            <div className="relative">
              <Input
                className={cn('h-8 w-[120px]', columnMeta.unit && 'pr-8')}
                inputMode="numeric"
                onChange={(event) => column.setFilterValue(event.target.value)}
                placeholder={getTitle()}
                type="number"
                value={(column.getFilterValue() as string) ?? ''}
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
              multiple={columnMeta.variant === 'dateRange'}
              title={getTitle()}
            />
          );

        case 'select':
        case 'multiSelect':
          return (
            <DataTableFacetedFilter
              column={column}
              multiple={columnMeta.variant === 'multiSelect'}
              options={columnMeta.options ?? []}
              title={getTitle()}
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
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isExpanded = isFocused || (value?.length ?? 0) > 0;

  const handleClear = useCallback(() => {
    onChange('');
    // Re-focus after clearing
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  return (
    <div
      aria-label={placeholder ?? 'Search'}
      className={cn(
        'relative flex items-center rounded-md border border-input bg-background text-sm transition-[width] duration-300 ease-out',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        'h-8 min-h-8',
        isExpanded ? 'w-56 lg:w-72' : 'w-32'
      )}
      role="search"
    >
      <SearchIcon className="ml-2 size-4 shrink-0" />

      <Input
        className={cn(
          'absolute inset-0 h-full w-full rounded-md border-0 bg-transparent py-2 pr-7 pl-7 shadow-none',
          'focus-visible:ring-0 focus-visible:ring-offset-0',
          'transition-opacity duration-200',
          'truncate align-baseline font-medium text-[14px]'
        )}
        onBlur={() => setIsFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        placeholder={placeholder}
        ref={inputRef}
        size="sm"
        value={value}
      />

      {isExpanded && value && (
        <button
          aria-label="Clear search"
          className="absolute right-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleClear();
          }}
          type="button"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
