import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ColumnsIcon } from 'lucide-react';
import { useQueryState } from 'nuqs';
import { useLocalStorage } from 'usehooks-ts';

// Define available columns
const AVAILABLE_COLUMNS = [
  { id: 'name', label: 'Name' },
  { id: 'createdAt', label: 'Created at' },
  { id: 'profileId', label: 'Profile' },
  { id: 'country', label: 'Country' },
  { id: 'os', label: 'OS' },
  { id: 'browser', label: 'Browser' },
  { id: 'properties', label: 'Properties' },
  { id: 'sessionId', label: 'Session ID' },
  { id: 'deviceId', label: 'Device ID' },
] as const;

export function useEventsTableColumns() {
  return useLocalStorage<string[]>('@op:events-table-columns', [
    'name',
    'createdAt',
    'profileId',
    'country',
    'os',
    'browser',
  ]);
}

export function EventsTableColumns() {
  const [visibleColumns, setVisibleColumns] = useEventsTableColumns();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <ColumnsIcon className="h-4 w-4 mr-2" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[200px]">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AVAILABLE_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visibleColumns.includes(column.id)}
            onCheckedChange={(checked) => {
              setVisibleColumns(
                checked
                  ? [...visibleColumns, column.id]
                  : visibleColumns.filter((id) => id !== column.id),
              );
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
