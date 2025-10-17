import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Table } from '@tanstack/react-table';
import {
  Check,
  ChevronsUpDown,
  GripVertical,
  RotateCcw,
  Settings2Icon,
} from 'lucide-react';
import * as React from 'react';

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

interface SortableColumnItemProps {
  column: any;
  onToggleVisibility: () => void;
}

function SortableColumnItem({
  column,
  onToggleVisibility,
}: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <CommandItem
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center gap-2', isDragging && 'opacity-50')}
      onSelect={onToggleVisibility}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="size-3 text-muted-foreground" />
      </div>
      <span className="truncate flex-1">
        {typeof column.columnDef.header === 'string'
          ? column.columnDef.header
          : (column.columnDef.meta?.label ?? column.id)}
      </span>
      <Check
        className={cn(
          'ml-auto size-4 shrink-0',
          column.getIsVisible() ? 'opacity-100' : 'opacity-0',
        )}
      />
    </CommandItem>
  );
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  const allColumns = table.getAllColumns();
  const filterableColumns = allColumns.filter(
    (column) => typeof column.accessorFn !== 'undefined' && column.getCanHide(),
  );

  // Use the column order from the table state (managed by useDataTableColumnVisibility)
  const columns = React.useMemo(() => {
    const columnMap = new Map(filterableColumns.map((col) => [col.id, col]));
    const orderedColumns: typeof filterableColumns = [];
    const currentColumnOrder = table.getState().columnOrder;

    // Add columns in the current table order
    currentColumnOrder.forEach((columnId) => {
      const column = columnMap.get(columnId);
      if (column) {
        orderedColumns.push(column);
        columnMap.delete(columnId);
      }
    });

    // Add any new columns that weren't in the current order
    columnMap.forEach((column) => {
      orderedColumns.push(column);
    });

    return orderedColumns;
  }, [filterableColumns, table]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = columns.findIndex((column) => column.id === active.id);
      const newIndex = columns.findIndex((column) => column.id === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        // Reorder the columns in the table
        const newColumns = [...columns];
        const [removed] = newColumns.splice(oldIndex, 1);
        newColumns.splice(newIndex, 0, removed);

        // Update the table column order (this will automatically persist via useDataTableColumnVisibility)
        table.setColumnOrder(newColumns.map((col) => col.id));
      }
    }
  };

  const handleReset = () => {
    // Reset column visibility to default (all visible)
    allColumns.forEach((column) => {
      if (column.getCanHide()) {
        column.toggleVisibility(
          typeof column.columnDef.meta?.hidden === 'boolean'
            ? !column.columnDef.meta?.hidden
            : true,
        );
      }
    });

    // Reset column order to default (this will automatically persist via useDataTableColumnVisibility)
    const defaultOrder = filterableColumns.map((col) => col.id);
    table.setColumnOrder(defaultOrder);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Toggle columns"
          role="combobox"
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2Icon className="size-4 mr-2" />
          View
          <ChevronsUpDown className="opacity-50 ml-2 size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-0">
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList>
            <CommandEmpty>No columns found.</CommandEmpty>
            <CommandGroup>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={columns.map((col) => col.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columns.map((column) => (
                    <SortableColumnItem
                      key={column.id}
                      column={column}
                      onToggleVisibility={() =>
                        column.toggleVisibility(!column.getIsVisible())
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </CommandGroup>
            <CommandGroup>
              <CommandItem
                onSelect={handleReset}
                className="text-muted-foreground"
              >
                <RotateCcw className="size-4 mr-2" />
                Reset to default
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
