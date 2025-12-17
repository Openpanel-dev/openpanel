import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useTRPC } from '@/integrations/trpc/react';
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
    }),
  );

  if (isLoading) {
    const keys = Array.from({ length: 4 }, (_, i) => `insight-skeleton-${i}`);
    return (
      <div className="col-span-6">
        <Carousel opts={{ align: 'start' }} className="w-full">
          <CarouselContent className="-ml-4">
            {keys.map((key) => (
              <CarouselItem
                key={key}
                className="pl-4 basis-full sm:basis-1/2 lg:basis-1/4"
              >
                <Skeleton className="h-36 w-full" />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    );
  }

  if (!insights || insights.length === 0) return null;

  return (
    <div className="col-span-6 -mx-4">
      <Carousel opts={{ align: 'start' }} className="w-full group">
        <CarouselContent className="mr-4">
          {insights.map((insight) => (
            <CarouselItem
              key={insight.id}
              className="pl-4 basis-full sm:basis-1/2 lg:basis-1/4"
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
        <CarouselPrevious className="!opacity-0 pointer-events-none transition-opacity group-hover:!opacity-100 group-hover:pointer-events-auto group-focus:opacity-100 group-focus:pointer-events-auto" />
        <CarouselNext className="!opacity-0 pointer-events-none transition-opacity group-hover:!opacity-100 group-hover:pointer-events-auto group-focus:opacity-100 group-focus:pointer-events-auto" />
      </Carousel>
    </div>
  );
}
