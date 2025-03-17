'use client';

import { Button } from '@/components/ui/button';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getPropertyLabel } from '@/translations/properties';
import { cn } from '@/utils/cn';
import { operators } from '@openpanel/constants';
import { X } from 'lucide-react';
import type { Options as NuqsOptions } from 'nuqs';

interface OverviewFiltersButtonsProps {
  className?: string;
  nuqsOptions?: NuqsOptions;
}

export function OverviewFiltersButtons({
  className,
  nuqsOptions,
}: OverviewFiltersButtonsProps) {
  const [events, setEvents] = useEventQueryNamesFilter(nuqsOptions);
  const [filters, setFilter, setFilters, removeFilter] =
    useEventQueryFilters(nuqsOptions);
  if (filters.length === 0 && events.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {events.map((event) => (
        <Button
          key={event}
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => setEvents((p) => p.filter((e) => e !== event))}
        >
          <strong className="font-semibold">{event}</strong>
        </Button>
      ))}
      {filters.map((filter) => {
        return (
          <Button
            key={filter.name}
            size="sm"
            variant="outline"
            icon={X}
            onClick={() => removeFilter(filter.name)}
          >
            <span>{getPropertyLabel(filter.name)}</span>
            <span className="opacity-40 ml-2 lowercase">
              {operators[filter.operator]}
            </span>
            {filter.value.length > 0 && (
              <strong className="font-semibold ml-2">
                {filter.value.join(', ')}
              </strong>
            )}
          </Button>
        );
      })}
    </div>
  );
}
