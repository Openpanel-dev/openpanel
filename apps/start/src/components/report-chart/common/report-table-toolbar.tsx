import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { List, Rows3, Search, X } from 'lucide-react';

interface ReportTableToolbarProps {
  grouped?: boolean;
  onToggleGrouped?: () => void;
  search: string;
  onSearchChange?: (value: string) => void;
  onUnselectAll?: () => void;
}

export function ReportTableToolbar({
  grouped,
  onToggleGrouped,
  search,
  onSearchChange,
  onUnselectAll,
}: ReportTableToolbarProps) {
  return (
    <div className="col md:row md:items-center gap-2 p-2 border-b md:justify-between">
      {onSearchChange && (
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        {onToggleGrouped && (
          <Button
            variant={'outline'}
            size="sm"
            onClick={onToggleGrouped}
            icon={grouped ? Rows3 : List}
          >
            {grouped ? 'Grouped' : 'Flat'}
          </Button>
        )}
        {onUnselectAll && (
          <Button variant="outline" size="sm" onClick={onUnselectAll} icon={X}>
            Unselect All
          </Button>
        )}
      </div>
    </div>
  );
}
