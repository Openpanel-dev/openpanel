import { List, Rows3, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    <div className="col md:row gap-2 border-b p-2 md:items-center md:justify-between">
      {onSearchChange && (
        <div className="relative w-full flex-1 md:max-w-sm">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            value={search}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        {onToggleGrouped && (
          <Button
            icon={grouped ? Rows3 : List}
            onClick={onToggleGrouped}
            size="sm"
            variant={'outline'}
          >
            {grouped ? 'Grouped' : 'Flat'}
          </Button>
        )}
        {onUnselectAll && (
          <Button icon={X} onClick={onUnselectAll} size="sm" variant="outline">
            Unselect All
          </Button>
        )}
      </div>
    </div>
  );
}
