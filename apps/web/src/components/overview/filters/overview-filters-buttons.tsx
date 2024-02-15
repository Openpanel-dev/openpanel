'use client';

import { Button } from '@/components/ui/button';
import {
  useEventFilters,
  useEventQueryFilters,
} from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { X } from 'lucide-react';

export function OverviewFiltersButtons() {
  const eventQueryFilters = useEventQueryFilters();
  const filters = Object.entries(eventQueryFilters).filter(
    ([, filter]) => filter.get !== null
  );
  return (
    <div
      className={cn('flex flex-wrap gap-2', filters.length > 0 && 'px-4 pb-4')}
    >
      {filters.map(([key, filter]) => (
        <Button
          key={key}
          size="sm"
          variant="outline"
          icon={X}
          onClick={() => filter.set(null)}
        >
          <span className="mr-1">{key} is</span>
          <strong>{filter.get}</strong>
        </Button>
      ))}
    </div>
  );
}
