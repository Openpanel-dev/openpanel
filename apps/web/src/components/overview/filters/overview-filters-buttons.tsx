'use client';

import { Button } from '@/components/ui/button';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { cn } from '@/utils/cn';
import { X } from 'lucide-react';
import { Options as NuqsOptions } from 'nuqs';

interface OverviewFiltersButtonsProps {
  className?: string;
  nuqsOptions?: NuqsOptions;
}

export function OverviewFiltersButtons({
  className,
  nuqsOptions,
}: OverviewFiltersButtonsProps) {
  const eventQueryFilters = useEventQueryFilters(nuqsOptions);
  const filters = Object.entries(eventQueryFilters).filter(
    ([, filter]) => filter.get !== null
  );
  if (filters.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-2 px-4 pb-4', className)}>
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
