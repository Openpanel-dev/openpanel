import { useQuery } from '@tanstack/react-query';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

export function OriginFilter() {
  const { projectId } = useAppParams();
  const [filters, setFilter] = useEventQueryFilters();
  const originFilter = filters.find((item) => item.name === 'origin');
  const trpc = useTRPC();

  const { data } = useQuery(
    trpc.event.origin.queryOptions({ projectId }, { staleTime: 1000 * 60 * 60 })
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
            className={cn(
              'max-w-56 cursor-pointer truncate rounded-md border px-2.5 py-1 text-sm transition-colors',
              active
                ? 'border-foreground bg-foreground font-medium text-background'
                : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            )}
            key={item.origin}
            onClick={() => setFilter('origin', [item.origin], 'is')}
            type="button"
          >
            {item.origin}
          </button>
        );
      })}
    </div>
  );
}
