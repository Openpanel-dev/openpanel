import type { Column } from '@tanstack/react-table';
import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  EyeOffIcon,
  XIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DataTableColumnHeaderProps<TData, TValue>
  extends React.ComponentProps<typeof DropdownMenuTrigger> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
  ...props
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!(column.getCanSort() || column.getCanHide())) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          '-ml-1.5 flex h-8 items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] uppercase hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring data-[state=open]:bg-accent [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
          className
        )}
        {...props}
      >
        {title}
        {column.getCanSort() &&
          (column.getIsSorted() === 'desc' ? (
            <ChevronDownIcon />
          ) : column.getIsSorted() === 'asc' ? (
            <ChevronUpIcon />
          ) : (
            <ChevronsUpDownIcon />
          ))}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-28">
        {column.getCanSort() && (
          <>
            <DropdownMenuCheckboxItem
              checked={column.getIsSorted() === 'asc'}
              className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
              onClick={() => column.toggleSorting(false)}
            >
              <ChevronUpIcon className="size-4" />
              Asc
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={column.getIsSorted() === 'desc'}
              className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
              onClick={() => column.toggleSorting(true)}
            >
              <ChevronDownIcon className="size-4" />
              Desc
            </DropdownMenuCheckboxItem>
            {column.getIsSorted() && (
              <DropdownMenuItem
                className="pl-2 [&_svg]:text-muted-foreground"
                onClick={() => column.clearSorting()}
              >
                <XIcon className="size-4" />
                Reset
              </DropdownMenuItem>
            )}
          </>
        )}
        {column.getCanHide() && (
          <DropdownMenuCheckboxItem
            checked={!column.getIsVisible()}
            className="relative pr-8 pl-2 [&>span:first-child]:right-2 [&>span:first-child]:left-auto [&_svg]:text-muted-foreground"
            onClick={() => column.toggleVisibility(false)}
          >
            <EyeOffIcon className="size-4" />
            Hide
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
