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
    size: 40,
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
}: {
  column: Column<TData>;
}): React.CSSProperties {
  const pinnedColumnWidth = 40;
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
    zIndex: isPinned ? 1 : 0,
    // Force fixed width for pinned columns, let others auto-size
    width: isPinned ? `${pinnedColumnWidth}px` : 'auto',
    minWidth: isPinned ? `${pinnedColumnWidth}px` : undefined,
    maxWidth: isPinned ? `${pinnedColumnWidth}px` : undefined,
    flexShrink: isPinned ? 0 : undefined,
    flexGrow: isPinned ? 0 : undefined,
    padding: isPinned ? 4 : undefined,
  };
}
