'use client';

import { Button } from '@/components/ui/button';
import {
  useEventQueryFilters,
  useEventQueryNamesFilter,
} from '@/hooks/useEventQueryFilters';
import { getPropertyLabel } from '@/translations/properties';
import { cn } from '@/utils/cn';
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
  const [filters, setFilter] = useEventQueryFilters(nuqsOptions);
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
        if (!filter.value[0]) {
          return null;
        }

        return (
          <Button
            key={filter.name}
            size="sm"
            variant="outline"
            icon={X}
            onClick={() => setFilter(filter.name, [], 'is')}
          >
            <span className="mr-1">{getPropertyLabel(filter.name)} is</span>
            <strong className="font-semibold">{filter.value.join(', ')}</strong>
          </Button>
        );
      })}
    </div>
  );
}
