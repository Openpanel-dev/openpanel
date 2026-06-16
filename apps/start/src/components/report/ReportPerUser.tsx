import { cn } from '@/utils/cn';
import { DatabaseIcon, UserCogIcon } from 'lucide-react';

import type { IChartEvent, IPerUserAggregation } from '@openpanel/validation';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '../ui/button';
import { PropertiesCombobox } from './sidebar/PropertiesCombobox';

// Mixpanel-style per-user (two-level) computed metric. `off` clears it.
const OPTIONS: { value: IPerUserAggregation | 'off'; label: string }[] = [
  { value: 'off', label: 'Off (aggregate all events)' },
  { value: 'count', label: 'Count of events' },
  { value: 'sum', label: 'Sum of property' },
  { value: 'avg', label: 'Average of property' },
  { value: 'min', label: 'Min of property' },
  { value: 'max', label: 'Max of property' },
  { value: 'median', label: 'Median of property' },
  { value: 'p90', label: 'P90 of property' },
  { value: 'p95', label: 'P95 of property' },
  { value: 'p99', label: 'P99 of property' },
  { value: 'distinct_count', label: 'Distinct count of property' },
];

interface ReportPerUserProps {
  className?: string;
  event: IChartEvent;
  onChange: (perUser: IChartEvent['perUser']) => void;
}

export function ReportPerUser({
  className,
  event,
  onChange,
}: ReportPerUserProps) {
  const current = event.perUser;
  const value: IPerUserAggregation | 'off' = current?.aggregation ?? 'off';
  const needsProperty = !!current && current.aggregation !== 'count';

  const activeLabel = OPTIONS.find((o) => o.value === value)?.label ?? 'Off';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            icon={UserCogIcon}
            className={cn('justify-start text-sm', className)}
          >
            {current ? `Per user: ${activeLabel}` : 'Per user'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          <DropdownMenuLabel>Per-user metric</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {OPTIONS.map((item) => (
              <DropdownMenuItem
                key={item.value}
                onClick={() => {
                  if (item.value === 'off') {
                    onChange(undefined);
                    return;
                  }
                  onChange({
                    aggregation: item.value,
                    property:
                      item.value === 'count' ? undefined : current?.property,
                  });
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {needsProperty && (
        // Only event properties can be aggregated per user (profile properties
        // are one value per user → nothing to aggregate), so restrict to the
        // clean, searchable event-properties list.
        <PropertiesCombobox
          event={event}
          mode="events"
          onSelect={(action) => {
            onChange({
              aggregation: current!.aggregation,
              property: action.value,
            });
          }}
        >
          {(setOpen) => (
            <button
              type="button"
              onClick={() => setOpen((p) => !p)}
              className={cn(
                'flex items-center gap-1 rounded-md border border-border p-1 px-2 text-sm font-medium leading-none',
                !current?.property && 'border-destructive text-destructive',
              )}
            >
              <DatabaseIcon size={12} />{' '}
              {current?.property
                ? `Property: ${current.property}`
                : 'Select property'}
            </button>
          )}
        </PropertiesCombobox>
      )}
    </>
  );
}
