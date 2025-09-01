import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import { useQuery } from '@tanstack/react-query';
import { GlobeIcon } from 'lucide-react';

export function OriginFilter() {
  const { projectId } = useAppParams();
  const [filters, setFilter] = useEventQueryFilters();
  const originFilter = filters.find((item) => item.name === 'origin');
  const trpc = useTRPC();

  const { data } = useQuery(
    trpc.event.origin.queryOptions(
      {
        projectId: projectId,
      },
      {
        staleTime: 1000 * 60 * 60,
      },
    ),
  );

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {data?.map((item) => {
        return (
          <Button
            key={item.origin}
            variant="outline"
            icon={GlobeIcon}
            className={cn(
              originFilter?.value.includes(item.origin) && 'border-foreground',
            )}
            onClick={() => setFilter('origin', [item.origin], 'is')}
          >
            {item.origin}
          </Button>
        );
      })}
    </div>
  );
}
