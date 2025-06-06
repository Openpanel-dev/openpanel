'use client';

import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';

import { ModalContent, ModalHeader } from '@/modals/Modal/Container';
import { api } from '@/trpc/client';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { OverviewWidgetTablePages } from './overview-widget-table';
import { useOverviewOptions } from './useOverviewOptions';

interface OverviewTopPagesProps {
  projectId: string;
}

function getPath(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

export default function OverviewTopPagesModal({
  projectId,
}: OverviewTopPagesProps) {
  const [filters, setFilter] = useEventQueryFilters();
  const { startDate, endDate, range, interval } = useOverviewOptions();
  const query = api.overview.topPages.useInfiniteQuery(
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
