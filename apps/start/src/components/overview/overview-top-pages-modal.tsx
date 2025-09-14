import { useEventQueryFilters } from '@/hooks/use-event-query-filters';

import { useTRPC } from '@/integrations/trpc/react';
import { ModalContent, ModalHeader } from '@/modals/Modal/Container';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { OverviewWidgetTablePages } from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewTopPagesProps {
  projectId: string;
}

export default function OverviewTopPagesModal({
  projectId,
}: OverviewTopPagesProps) {
  const [filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range } = useOverviewOptions();
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.overview.topPages.infiniteQueryOptions(
      {
        projectId,
        filters,
        startDate,
        endDate,
        mode: 'page',
        range,
        interval: 'day',
        limit: 50,
      },
      {
        getNextPageParam: (_, pages) => pages.length + 1,
      },
    ),
  );

  const data = query.data?.pages.flat();

  return (
    <ModalContent>
      <ModalHeader title="Top Pages" />
      <ScrollArea className="-mx-6 px-2">
        <OverviewWidgetTablePages
          data={data ?? []}
          lastColumnName={'Sessions'}
        />
        <div className="row center-center p-4 pb-0">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => query.fetchNextPage()}
            loading={query.isFetching}
          >
            Load more
          </Button>
        </div>
      </ScrollArea>
    </ModalContent>
  );
}
