import type { Column, ColumnDef, Row } from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '../button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { DataTableColumnHeader } from './data-table-column-header';

export function createHeaderColumn<TData>(
  title: string,
): ColumnDef<TData>['header'] {
  return ({ column }) => (
    <DataTableColumnHeader column={column} title={title} />
  );
}

export function createActionColumn<TData>(
  Component: ({ row }: { row: Row<TData> }) => React.ReactNode,
): ColumnDef<TData> {
  return {
    id: 'actions',
    header: '',
    enablePinning: true,
    meta: {
      pinned: 'right',
    },
    size: 20,
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button icon={MoreHorizontalIcon} size="icon" variant={'ghost'} />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end">
            <Component row={row} />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  };
}

export function getCommonPinningStyles<TData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>;
  withBorder?: boolean;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === 'left' && column.getIsLastColumn('left');
  const isFirstRightPinnedColumn =
    isPinned === 'right' && column.getIsFirstColumn('right');

  return {
    boxShadow: isLastLeftPinnedColumn
      ? '-4px 0 4px -4px var(--border) inset'
      : isFirstRightPinnedColumn
        ? '4px 0 4px -4px var(--border) inset'
        : undefined,
    textAlign: isPinned && isFirstRightPinnedColumn ? 'right' : undefined,
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? 'sticky' : 'relative',
    background: isPinned ? 'var(--background)' : 'var(--background)',
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
    maxWidth: isPinned && isFirstRightPinnedColumn ? '50px' : undefined,
  };
}

// export function getFilterOperators(filterVariant: FilterVariant) {
//   const operatorMap: Record<
//     FilterVariant,
//     { label: string; value: FilterOperator }[]
//   > = {
//     text: dataTableConfig.textOperators,
//     number: dataTableConfig.numericOperators,
//     range: dataTableConfig.numericOperators,
//     date: dataTableConfig.dateOperators,
//     dateRange: dataTableConfig.dateOperators,
//     boolean: dataTableConfig.booleanOperators,
//     select: dataTableConfig.selectOperators,
//     multiSelect: dataTableConfig.multiSelectOperators,
//   };

//   return operatorMap[filterVariant] ?? dataTableConfig.textOperators;
// }

// export function getDefaultFilterOperator(filterVariant: FilterVariant) {
//   const operators = getFilterOperators(filterVariant);

//   return operators[0]?.value ?? (filterVariant === 'text' ? 'iLike' : 'eq');
// }

// export function getValidFilters<TData>(
//   filters: ExtendedColumnFilter<TData>[],
// ): ExtendedColumnFilter<TData>[] {
//   return filters.filter(
//     (filter) =>
//       filter.operator === 'isEmpty' ||
//       filter.operator === 'isNotEmpty' ||
//       (Array.isArray(filter.value)
//         ? filter.value.length > 0
//         : filter.value !== '' &&
//           filter.value !== null &&
//           filter.value !== undefined),
//   );
// }
