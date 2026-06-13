import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Columns3, List, Rows3, Search, X } from 'lucide-react';

export type ReportTableAliasableColumn = {
  key: string;
  label: string;
};

interface ReportTableToolbarProps {
  grouped?: boolean;
  onToggleGrouped?: () => void;
  search: string;
  onSearchChange?: (value: string) => void;
  onUnselectAll?: () => void;
  aliasableColumns?: ReportTableAliasableColumn[];
  columnAliases?: Record<string, string>;
  hiddenColumnKeys?: string[];
  dateMode?: 'columns' | 'aggregate';
  onColumnAliasChange?: (key: string, alias: string) => void;
  onColumnVisibilityChange?: (key: string, visible: boolean) => void;
  onDateModeChange?: (dateMode: 'columns' | 'aggregate') => void;
}

export function ReportTableToolbar({
  grouped,
  onToggleGrouped,
  search,
  onSearchChange,
  onUnselectAll,
  aliasableColumns = [],
  columnAliases = {},
  hiddenColumnKeys = [],
  dateMode = 'columns',
  onColumnAliasChange,
  onColumnVisibilityChange,
  onDateModeChange,
}: ReportTableToolbarProps) {
  const showColumnControls =
    (!!onColumnAliasChange || !!onColumnVisibilityChange || !!onDateModeChange) &&
    aliasableColumns.length > 0;

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
        {showColumnControls && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" icon={Columns3}>
                Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0" portal>
              <div className="border-b p-3">
                <div className="font-medium">Table columns</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Show, hide, and rename columns for this table chart only.
                </p>
              </div>
              {onDateModeChange && (
                <div className="flex items-center justify-between gap-4 border-b p-3">
                  <div>
                    <div className="text-sm font-medium">
                      Aggregate date columns
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Show one total column instead of one column per interval.
                    </p>
                  </div>
                  <Switch
                    checked={dateMode === 'aggregate'}
                    onCheckedChange={(checked) =>
                      onDateModeChange(checked ? 'aggregate' : 'columns')
                    }
                  />
                </div>
              )}
              <div className="max-h-96 overflow-auto p-3">
                <div className="flex flex-col gap-3">
                  {aliasableColumns.map((column) => (
                    <div key={column.key} className="flex items-start gap-2">
                      {onColumnVisibilityChange && (
                        <Checkbox
                          checked={!hiddenColumnKeys.includes(column.key)}
                          onCheckedChange={(checked) =>
                            onColumnVisibilityChange(column.key, checked === true)
                          }
                          className="mt-6 h-4 w-4 shrink-0"
                        />
                      )}
                      <label className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {column.label}
                        </span>
                        <Input
                          placeholder={column.label}
                          value={columnAliases[column.key] ?? ''}
                          onChange={(event) =>
                            onColumnAliasChange?.(
                              column.key,
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
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
