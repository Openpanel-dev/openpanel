import { useAppParams } from '@/hooks/use-app-params';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';

export function OriginFilter() {
  const { projectId } = useAppParams();
  const [filters, setFilter] = useEventQueryFilters();
  const originFilter = filters.find((item) => item.name === 'origin');
  const trpc = useTRPC();

  const { data } = useQuery(
    trpc.event.origin.queryOptions(
      { projectId },
      { staleTime: 1000 * 60 * 60 },
    ),
  );

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {data.map((item) => {
        const active = originFilter?.value.includes(item.origin);
        return (
          <button
            key={item.origin}
            type="button"
            onClick={() => setFilter('origin', [item.origin], 'is')}
            className={cn(
              'rounded-md border px-2.5 py-1 text-sm transition-colors cursor-pointer truncate max-w-56',
              active
                ? 'bg-foreground text-background border-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:border-foreground/30',
            )}
          >
            {item.origin}
          </button>
        );
      })}
    </div>
  );
}
