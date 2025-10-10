import type { DataTableConfig } from '@/components/ui/data-table/data-table-config';
import type { FilterItemSchema } from '@/components/ui/data-table/data-table-parsers';
import type { ColumnSort, FilterFn, Row, RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
    pinned?: 'left' | 'right';
    bold?: boolean;
    hidden?: boolean;
  }

  interface FilterFns {
    isWithinRange: FilterFn<unknown>;
  }
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

export type FilterOperator = DataTableConfig['operators'][number];
export type FilterVariant = DataTableConfig['filterVariants'][number];
export type JoinOperator = DataTableConfig['joinOperators'][number];

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, 'id'> {
  id: Extract<keyof TData, string>;
}

export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}

export interface DataTableRowAction<TData> {
  row: Row<TData>;
  variant: 'update' | 'delete';
}
