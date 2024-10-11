import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { api } from '@/trpc/client';
import { cn } from '@/utils/cn';
import { GlobeIcon } from 'lucide-react';

export function OriginFilter() {
  const { projectId } = useAppParams();
  const [filters, setFilter] = useEventQueryFilters();
  const originFilter = filters.find((item) => item.name === 'origin');

  const { data } = api.event.origin.useQuery(
    {
      projectId: projectId,
    },
    {
      staleTime: 1000 * 60 * 60,
    },
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
