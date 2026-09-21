import { useQuery } from '@tanstack/react-query';
import { InsightCard } from '../insights/insight-card';
import { Skeleton } from '../skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../ui/carousel';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';

interface OverviewInsightsProps {
  projectId: string;
}

export default function OverviewInsights({ projectId }: OverviewInsightsProps) {
  const trpc = useTRPC();
  const [filters, setFilter] = useEventQueryFilters();
  const { data: insights, isLoading } = useQuery(
    trpc.insight.list.queryOptions({
      projectId,
      limit: 20,
    })
  );

  if (isLoading) {
    const keys = Array.from({ length: 4 }, (_, i) => `insight-skeleton-${i}`);
    return (
      <div className="col-span-6">
        <Carousel className="w-full" opts={{ align: 'start' }}>
          <CarouselContent className="-ml-4">
            {keys.map((key) => (
              <CarouselItem
                className="basis-full pl-4 sm:basis-1/2 lg:basis-1/4"
                key={key}
              >
                <Skeleton className="h-36 w-full" />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return null;
  }

  return (
    <div className="col-span-6 -mx-4">
      <Carousel className="group w-full" opts={{ align: 'start' }}>
        <CarouselContent className="mr-4">
          {insights.map((insight) => (
            <CarouselItem
              className="basis-full pl-4 sm:basis-1/2 lg:basis-1/4"
              key={insight.id}
            >
              <InsightCard
                insight={insight}
                onFilter={() => {
                  insight.payload.dimensions.forEach((dim) => {
                    void setFilter(dim.key, dim.value, 'is');
                  });
                }}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="!opacity-0 group-hover:!opacity-100 pointer-events-none transition-opacity group-hover:pointer-events-auto group-focus:pointer-events-auto group-focus:opacity-100" />
        <CarouselNext className="!opacity-0 group-hover:!opacity-100 pointer-events-none transition-opacity group-hover:pointer-events-auto group-focus:pointer-events-auto group-focus:opacity-100" />
      </Carousel>
    </div>
  );
}
